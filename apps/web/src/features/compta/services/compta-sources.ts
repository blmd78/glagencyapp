import { daysIn, mondaysIn, type PayPeriod } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { loadPeriodCa } from './compta-ca'

/**
 * LECTURES de la compta d'une période de paie — rien d'autre. Séparé de `compta-rows.ts` (qui
 * assemble les fiches) pour tenir les deux fichiers sous 300 lignes (CLAUDE.md) et parce que
 * c'est une frontière nette : ici les requêtes et le POURQUOI de chacune, là le calcul.
 *
 * Le cloisonnement est porté par la RLS (0085) : admin → tout, manager/sous-manager → ses
 * rattachés directs. SAUF le CA, la date d'entrée et les noms de modèles, lus par client
 * ADMIN et cadrés côté application — et SAUF la population elle-même, dont la RLS est
 * transitive depuis 0087 et que le filtre `manager_id` de l'ancre re-borne aux directs. Les
 * deux exceptions sont détaillées au commentaire de l'ancre, plus bas.
 */

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
  // Client ADMIN — pour la SEULE `chatter_first_seen()` ci-dessous (le motif est à son appel).
  // Le CA, l'autre lecture hors RLS, a son propre client dans `compta-ca.ts`.
  const admin = createAdminClient()
  const mondays = mondaysIn(period)
  const from = period.start
  const to = period.end

  // L'APPELANT — `getProfile()` est `cache()` (mémoïsé par requête) : la page a déjà appelé
  // `requireAccess('compta')` et les deux gestes de paiement `requireAdminProfile()` dans le
  // même rendu, donc pas de seconde requête. Même patron que `get-compta.ts` / `get-suivi.ts`.
  const profile = await getProfile()
  // Inatteignable derrière le garde de page (`requireAccess` redirige vers /login sans session)
  // et derrière `requireAdminProfile` côté paiement : on préfère lever plutôt que construire une
  // requête dont le filtre de périmètre serait vide.
  if (!profile) throw new Error('Session expirée')
  const isAdmin = profile.role === 'admin'

  // La population vient de `profiles` (rôle chatteur), pas de `chatters` : c'est le MEMBRE
  // qu'on paie (0085). 96 lignes sur l'UAT — loin du plafond PostgREST.
  //
  // ⚠️ CETTE LECTURE EST L'ANCRE DE SÉCURITÉ DE TOUT LE FICHIER, et depuis 0087 elle ne peut
  // plus s'en remettre à la seule RLS. La policy `profiles_self_admin_or_team_read` est
  // désormais TRANSITIVE : `id = auth.uid() or is_admin() or (is_manager() and id = any(array(
  // select managed_subtree())))` — un manager y lit donc TOUT son sous-arbre, les chatteurs de
  // ses sous-managers compris, là où elle rendait ses seuls rattachés directs avant 0087.
  //
  // Le `.eq('manager_id', …)` ci-dessous RE-BORNE la compta aux rattachés DIRECTS, À DESSEIN :
  // le périmètre de PAIE reste direct (décision de la spec compta — un manager gère SES
  // chatteurs). La transitivité de 0087 ne vaut que pour VOIR (dashboard, membres, comptes
  // rendus). Toutes les AUTRES lectures de ce fichier — `compta_settings`, `compta_rates`,
  // `compta_primes`, `compta_payments`, `compta_day_entries`, `compta_week_entries` — sont
  // restées sur `manages()`, direct-only (0085, intouchée par 0087). Sans ce filtre, un manager
  // verrait donc les chatteurs de ses sous-managers avec un net FAUX et SILENCIEUX : taux
  // retombé sur le fallback 10 %, fixe 0, périodes réglées affichées « non payé ».
  //
  // Les lectures par client ADMIN plus bas se cadrent TOUTES sur ce que cette requête a
  // renvoyé — ne jamais les élargir au-delà.
  let membersQuery = supabase
    .from('profiles')
    .select('id, display_name, email, role, chatter_id')
    .eq('role', 'chatteur')
    .order('display_name')
  if (!isAdmin) membersQuery = membersQuery.eq('manager_id', profile.id)

  const [
    { data: members, error: membersErr },
    { data: settings, error: settingsErr },
    { data: rates, error: ratesErr },
    { data: primes, error: primesErr },
    { data: dayEntries, error: dayErr },
    { data: weekEntries, error: weekErr },
    { data: payments, error: payErr },
    { data: sanctions, error: sancErr },
    { data: firstSeen, error: firstSeenErr },
  ] = await Promise.all([
    memberId ? membersQuery.eq('id', memberId) : membersQuery,
    // Une ligne par membre au plus (PK `chatter_id`) → sous le plafond. Ne porte plus que le
    // FIXE depuis 0093 : le taux est daté et vit dans `compta_rates`, juste en dessous.
    supabase.from('compta_settings').select('*'),
    // ── L'HISTORIQUE DES TAUX (0093) ────────────────────────────────────────────────────────
    // TOUT l'historique, sans filtre de date, et c'est nécessaire : le taux en vigueur le
    // PREMIER jour de la période est porté par une ligne qui peut dater d'il y a un an. Filtrer
    // sur la période ne renverrait que les changements survenus PENDANT, et ferait retomber les
    // jours d'avant sur le défaut de 10 % — une baisse silencieuse de la paie de tout le monde.
    //
    // `fetchAll` : une ligne PAR CHANGEMENT de taux, donc la table grossit sans borne (~96
    // membres × quelques augmentations par an). Le plafond PostgREST de 1000 lignes est
    // atteignable en un peu plus d'un an, et une troncature SILENCIEUSE y ferait disparaître
    // les augmentations les plus récentes — la paie repartirait à l'ancien taux sans une seule
    // erreur. `.order('chatter_id').order('effective_from')` = la PK complète → pagination
    // déterministe.
    fetchAll((f, t) =>
      supabase
        .from('compta_rates')
        .select('chatter_id, effective_from, rate')
        .order('chatter_id')
        .order('effective_from')
        .range(f, t),
    ),
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
  if (ratesErr) throw new Error(ratesErr.message)
  if (primesErr) throw new Error(primesErr.message)
  if (dayErr) throw new Error(dayErr.message)
  if (weekErr) throw new Error(weekErr.message)
  if (payErr) throw new Error(payErr.message)
  if (sancErr) throw new Error(sancErr.message)
  if (firstSeenErr) throw new Error(firstSeenErr.message)

  // LE CA DE LA PÉRIODE — hors RLS, cadré applicativement par `linked` (cf. `compta-ca.ts`).
  //
  // ⚠️ `linked` EST LA BARRIÈRE. Il ne contient que les `profiles.chatter_id` déjà renvoyés par
  // l'ancre ci-dessus (RLS + filtre `manager_id`) — donc, pour un encadrant, ses rattachés
  // directs et personne d'autre. NE JAMAIS le construire depuis une autre source.
  const linked = (members ?? []).map((m) => m.chatter_id).filter((v): v is string => v != null)
  const caByChatter = await loadPeriodCa({ linked, from, to })

  // Historique des taux par membre, TRIÉ par date d'effet. `rateSpans` retrie de son côté (il ne
  // fait confiance à personne sur l'ordre), mais le tri ici garde l'affichage de la fiche de
  // membre chronologique sans le refaire trois fois.
  const ratesById = new Map<string, { effectiveFrom: string; rate: number }[]>()
  for (const r of rates) {
    const line = { effectiveFrom: r.effective_from, rate: Number(r.rate) }
    const arr = ratesById.get(r.chatter_id)
    if (arr) arr.push(line)
    else ratesById.set(r.chatter_id, [line])
  }
  for (const arr of ratesById.values()) arr.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))

  return {
    members: members ?? [],
    settingsById: new Map((settings ?? []).map((s) => [s.chatter_id, s])),
    /** Historique du taux de commission par membre (`compta_rates`, 0093), trié. Une liste VIDE
     *  — ou un membre absent — signifie « jamais réglé » : `rateSpans` applique alors
     *  `DEFAULT_RATE` et marque le segment `fallback`. */
    ratesById,
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
    /** CA de la période par chatteur MyPuls — une ligne par (JOUR, nom de modèle). Le jour est
     *  ce qui permet de ventiler par segment de taux (0093). */
    caByChatter,
    /** Les 2 lundis de la période — ils bornent la lecture de `compta_week_entries`. Ils
     *  n'entrent dans AUCUN montant depuis la tâche 16 : le fixe est versé par période. */
    mondays,
    days: daysIn(period),
  }
}
