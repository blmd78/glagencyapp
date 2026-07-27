import { daysIn, mondaysIn, type PayPeriod } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * LECTURES de la compta d'une période de paie — rien d'autre. Séparé de `compta-rows.ts` (qui
 * assemble les fiches) pour tenir les deux fichiers sous 300 lignes (CLAUDE.md) et parce que
 * c'est une frontière nette : ici les requêtes et le POURQUOI de chacune, là le calcul.
 *
 * Le cloisonnement est porté par la RLS (0085) : admin → tout, manager/sous-manager → ses
 * rattachés directs. SAUF le CA, la date d'entrée et les noms de modèles, lus par client
 * ADMIN et cadrés côté application — voir le commentaire de l'ancre plus bas.
 */

interface CcdRow {
  chatter_id: string
  creator_id: string
  date: string
  ca: number | null
}

/**
 * Options du dialog « Relier à MyPuls » : les chatteurs MyPuls ENCORE LIBRES, c'est-à-dire
 * qu'aucun `profiles.chatter_id` ne réclame déjà. Proposer les autres n'offrirait que des
 * refus — `applyChatterLink` (lib/chatter-link.ts) rejette un chatteur déjà pris.
 *
 * ⚠️ APPELÉE UNIQUEMENT POUR UN ADMIN (cf. `get-compta.ts`), même motif que
 * `get-members.ts` : c'est une liste AGENCE-WIDE lue par client admin, hors de tout
 * périmètre RLS, et poser le lien est admin-seul (`applyChatterLink` + `adminGuard`). Un
 * manager ne doit pas la recevoir dans son payload.
 *
 * `fetchAll` sur les deux lectures : PostgREST tronque à 1000 lignes EN SILENCE (CLAUDE.md,
 * guidelines-data-loading §2). 318 chatteurs mesurés sur l'UAT le 2026-07-27 — sous le
 * plafond aujourd'hui, mais la table grossit à chaque nouveau chatteur MyPuls, et tronquée
 * elle ferait DISPARAÎTRE des options sans une seule erreur. `.order('id')` = la PK →
 * pagination déterministe (l'ordre d'affichage est refait par nom plus bas).
 */
export async function loadLinkableChatters(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient()
  const [{ data: chatters, error: chattersErr }, { data: linked, error: linkedErr }] =
    await Promise.all([
      fetchAll<{ id: string; display_name: string | null }>((f, t) =>
        admin.from('chatters').select('id, display_name').order('id').range(f, t),
      ),
      fetchAll<{ chatter_id: string | null }>((f, t) =>
        admin.from('profiles').select('chatter_id').not('chatter_id', 'is', null).order('id').range(f, t),
      ),
    ])
  if (chattersErr) throw new Error(chattersErr.message)
  if (linkedErr) throw new Error(linkedErr.message)

  const taken = new Set((linked ?? []).map((p) => p.chatter_id))
  return (chatters ?? [])
    .filter((c) => c.display_name && !taken.has(c.id))
    .map((c) => ({ id: c.id, name: c.display_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/**
 * `memberId` restreint la population à UN membre (recalcul serveur d'un paiement). Les autres
 * lectures ne sont PAS restreintes : la couverture et la prime raisonnent sur l'historique
 * complet des paiements, et le filtrage par membre se fait de toute façon ligne par ligne.
 */
export async function loadComptaSources({
  period,
  memberId,
}: {
  period: PayPeriod
  memberId?: string
}) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const mondays = mondaysIn(period)
  const from = period.start
  const to = period.end

  // La population vient de `profiles` (rôle chatteur), pas de `chatters` : c'est le MEMBRE
  // qu'on paie (0085). 96 lignes sur l'UAT — loin du plafond PostgREST.
  //
  // ⚠️ CETTE LECTURE EST L'ANCRE DE SÉCURITÉ DE TOUT LE FICHIER. La policy
  // `profiles_self_admin_or_team_read` vaut `id = auth.uid() or is_admin() or (is_manager() and
  // manager_id = auth.uid())` — vérifié sur `pg_policy` et mesuré sous RLS le 2026-07-27 :
  // Chérif 15 profils chatteur visibles = ses 15 rattachés, 0 hors périmètre ; Marco 35 = ses
  // 35, 0 hors périmètre. Les lectures par client ADMIN plus bas se cadrent TOUTES sur ce que
  // cette requête a renvoyé — ne jamais les élargir au-delà.
  const membersQuery = supabase
    .from('profiles')
    .select('id, display_name, email, role, chatter_id')
    .eq('role', 'chatteur')
    .order('display_name')

  const [
    { data: members, error: membersErr },
    { data: settings, error: settingsErr },
    { data: primes, error: primesErr },
    { data: dayEntries, error: dayErr },
    { data: weekEntries, error: weekErr },
    { data: payments, error: payErr },
    { data: sanctions, error: sancErr },
    { data: firstSeen, error: firstSeenErr },
  ] = await Promise.all([
    memberId ? membersQuery.eq('id', memberId) : membersQuery,
    // Une ligne par membre au plus (PK `chatter_id`) → sous le plafond.
    supabase.from('compta_settings').select('*'),
    // TOUS les statuts, et non les seules primes `'due'` : le formulaire de réglages (admin) a
    // besoin de l'état RÉEL pour ne pas proposer de recréer une prime déjà versée ou renoncée.
    // Le filtre `'due'` n'a pas disparu, il s'applique au CALCUL dans `compta-rows.ts`.
    supabase.from('compta_primes').select('*'),
    // `fetchAll` : 96 membres × 14 jours = 1 344 lignes possibles sur une période, au-delà du
    // plafond PostgREST de 1000 — franchi, il tronque EN SILENCE (CLAUDE.md,
    // guidelines-data-loading §2). Tronqué, ce sont des bonus ET des malus manuels qui
    // disparaissent : le net dérive dans les deux sens sans une seule erreur.
    // `.order('chatter_id').order('date')` = la PK complète → pagination déterministe.
    fetchAll((f, t) =>
      supabase
        .from('compta_day_entries')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('chatter_id')
        .order('date')
        .range(f, t),
    ),
    // Pas de `fetchAll` ici, et c'est mesuré : une période contient EXACTEMENT 2 lundis
    // (`mondaysIn`, 14 jours calés sur les lundis), donc 2 × 96 membres = 192 lignes. Le
    // plafond ne serait atteint qu'au-delà de 500 membres.
    supabase.from('compta_week_entries').select('*').in('week_start', mondays.length ? mondays : ['1970-01-01']),
    // TOUTE la table, sans filtre de période : `overdue` et la couverture raisonnent sur
    // l'historique complet. Donc `fetchAll` obligatoire — PostgREST tronque à 1000 lignes EN
    // SILENCE (CLAUDE.md, guidelines-data-loading §2), et ~96 chatteurs × 26 périodes/an
    // franchissent le plafond en quelques mois. Tronquée, la table ferait redevenir `paid`
    // faux sur des périodes réglées (bouton « Marquer payé » de retour sur une ligne déjà
    // payée) et mentir les deux KPI monétaires. `.order('id')` = la PK complète de
    // `compta_payments` → pagination déterministe.
    fetchAll((f, t) => supabase.from('compta_payments').select('*').order('id').range(f, t)),
    // `fetchAll` pour la MÊME raison, et c'est le cas le plus coûteux : ce sont les RETENUES.
    // Tronquée, la table fait disparaître des sanctions → net surestimé → l'admin SUR-PAIE,
    // sans erreur. Le plafond est atteignable dès que les 96 membres cumulent quelques entrées
    // par jour sur les 14 jours de la période. `.order('id')` = la PK de `police_entries`
    // (colonne non sélectionnée, PostgREST l'accepte — vérifié en HTTP 200 sur l'UAT).
    fetchAll((f, t) =>
      supabase
        .from('police_entries')
        .select('chatter_id, occurred_on, kind, error_key, amount_eur')
        .gte('occurred_on', from)
        .lte('occurred_on', to)
        .order('id')
        .range(f, t),
    ),
    // Date d'entrée de chaque chatteur MyPuls (`min(chatter_daily.date)`) — elle borne les
    // périodes qui le concernent (retard ET prime). Client ADMIN et non RLS : la fonction
    // est `security invoker` et `chatter_daily` ne porte qu'une policy
    // `chatter_daily_admin_read` (vérifié sur `pg_policy`, UAT) → appelée par un manager elle
    // renverrait ZÉRO ligne, et le bandeau comme la prime disparaîtraient de sa vue sans une
    // seule erreur. Aucune donnée brute n'en ressort : seules les dates des membres déjà
    // renvoyés par la RLS `profiles` sont lues.
    admin.rpc('chatter_first_seen'),
  ])
  if (membersErr) throw new Error(membersErr.message)
  if (settingsErr) throw new Error(settingsErr.message)
  if (primesErr) throw new Error(primesErr.message)
  if (dayErr) throw new Error(dayErr.message)
  if (weekErr) throw new Error(weekErr.message)
  if (payErr) throw new Error(payErr.message)
  if (sancErr) throw new Error(sancErr.message)
  if (firstSeenErr) throw new Error(firstSeenErr.message)

  // CA par (chatteur MyPuls, modèle) sur la période.
  //
  // ── CLIENT ADMIN, CADRAGE APPLICATIF ────────────────────────────────────────────────────
  // POURQUOI PAS SOUS RLS : `chatter_creator_daily_scoped_read` cloisonne PAR MODÈLE
  // (`profile_creators`), pas par chatteur. Un encadrant qui suit un chatteur sans être assigné
  // à TOUS les modèles sur lesquels celui-ci travaille y lit un CA AMPUTÉ — la requête ne lève
  // pas, elle renvoie moins de lignes. Mesuré sur l'UAT, plage 01–15/07/2026 : Giovani
  // 1 527,27 € réels → 97,54 € vus par Chérif (6 %) ; Benj2p 7 320,80 € → 4 728,22 € vus par
  // Marco. La base valant CA × taux, la fiche de paie affichée était fausse.
  //
  // POURQUOI PAS UNE POLICY ADDITIONNELLE (le remède retenu en 0086 pour les sanctions) : une
  // policy est par TABLE, pas par page. Elle aurait aussi élargi les quatre RPC `security
  // invoker` qui lisent cette même table (`chatters_report` 0017, `health_report` 0049,
  // `models_report` 0050, `overview_report` 0052) — arbitré le 2026-07-27 : la compta récupère
  // la valeur du chatteur, et RIEN d'autre ne bouge.
  //
  // ⚠️ CE QUI REMPLACE LA RLS ICI, C'EST `linked`. Le client admin ignore toute policy : le
  // `.in('chatter_id', linked)` est la SEULE barrière. `linked` ne contient que les
  // `profiles.chatter_id` déjà renvoyés par la lecture RLS de `profiles` ci-dessus — donc, pour
  // un encadrant, ses rattachés directs et personne d'autre. NE JAMAIS lire au-delà de cette
  // liste, ni la construire depuis une autre source. Même motif que `chatter_first_seen()` et
  // que les noms de `creators` plus bas.
  //
  // `fetchAll` : table de faits journaliers, troncature SILENCIEUSE à 1000 lignes sinon
  // (1 426 lignes mesurées sur la seule plage 01–15/07/2026, UAT).
  const linked = (members ?? []).map((m) => m.chatter_id).filter((v): v is string => v != null)
  const { data: ccd, error: ccdErr } = linked.length
    ? await fetchAll<CcdRow>((f, t) =>
        admin
          .from('chatter_creator_daily')
          .select('chatter_id, creator_id, date, ca')
          .in('chatter_id', linked)
          .gte('date', from)
          .lte('date', to)
          .order('chatter_id')
          .order('creator_id')
          .order('date')
          .range(f, t),
      )
    : { data: [], error: null }
  if (ccdErr) throw new Error(ccdErr.message)

  // Noms des modèles, par client ADMIN et non RLS — même motif et même cadrage que le CA
  // ci-dessus. `creators` est cloisonnée PAR MODÈLE (`creators_scoped_read`), alors que le CA
  // qu'on vient de lire couvre TOUS les modèles des rattachés : sous RLS, les modèles non
  // assignés perdaient leur nom et se fondaient tous dans une seule ligne « — » de la
  // ventilation de la fiche (3 modèles pour Chérif, 6 pour Marco — mesuré sur l'UAT).
  // Restreint aux `creator_id` DÉJÀ présents dans `ccd`, lui-même cadré sur `linked` : aucun
  // modèle supplémentaire n'en ressort.
  const creatorIds = [...new Set(ccd.map((r) => r.creator_id))]
  const { data: creators, error: creatorsErr } = creatorIds.length
    ? await admin.from('creators').select('id, name').in('id', creatorIds)
    : { data: [], error: null }
  if (creatorsErr) throw new Error(creatorsErr.message)

  const creatorName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const caByChatter = new Map<string, Record<string, number>>()
  for (const r of ccd) {
    const m = caByChatter.get(r.chatter_id) ?? {}
    const name = creatorName.get(r.creator_id) ?? '—'
    m[name] = (m[name] ?? 0) + (r.ca ?? 0)
    caByChatter.set(r.chatter_id, m)
  }

  return {
    members: members ?? [],
    settingsById: new Map((settings ?? []).map((s) => [s.chatter_id, s])),
    primeById: new Map(
      (primes ?? []).map((p) => [
        p.chatter_id,
        { amount: Number(p.amount), status: p.status, paidAt: p.paid_at },
      ]),
    ),
    dayEntries,
    weekEntries: weekEntries ?? [],
    payments,
    sanctions,
    firstSeen: firstSeen ?? [],
    /** CA de la période par chatteur MyPuls, ventilé par NOM de modèle. */
    caByChatter,
    /** Les 2 lundis de la période — `weekCount` de la formule (spec §4). */
    mondays,
    days: daysIn(period),
  }
}
