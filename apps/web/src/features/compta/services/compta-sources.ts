import { daysIn, mondaysIn, monthOfPeriod, periodsOfMonth, type PayPeriod } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
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
 * ADMIN et cadrés côté application — voir le commentaire de l'ancre plus bas.
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
  // Le MOIS de la période affichée (celui de son lundi de départ) et les 2 ou 3 périodes qui lui
  // sont rattachées. Ils ne servent qu'à UNE chose ici : savoir si la prime du mois a déjà été
  // saisie sur une AUTRE période du même mois, pour le dire dans la fiche AVANT que l'utilisateur
  // la retape (0092 la refuserait, mais un refus vaut moins qu'un avertissement).
  const monthPeriods = periodsOfMonth(monthOfPeriod(period))
  const monthPeriodStarts = monthPeriods.map((p) => p.start)

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
    { data: rates, error: ratesErr },
    { data: primes, error: primesErr },
    { data: dayEntries, error: dayErr },
    { data: weekEntries, error: weekErr },
    { data: payments, error: payErr },
    { data: sanctions, error: sancErr },
    { data: firstSeen, error: firstSeenErr },
    { data: periodEntries, error: periodErr },
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
    // Saisie PAR PÉRIODE (`compta_period_entries`, 0090) : le report (`RESTE SEMAINE PASSEE`) et
    // la prime du mois (`PRIME TOP3 MOIS`). Sous RLS, comme ses deux sœurs de saisie : admin →
    // tout, encadrement → ses rattachés.
    //
    // TOUTES LES PÉRIODES DU MOIS, et non la seule période affichée (2026-07-28) : la prime du
    // mois est un montant MENSUEL saisi sur une période, et l'app doit pouvoir dire « elle est
    // déjà sur l'autre période de juillet » plutôt que de laisser l'utilisateur la retaper et se
    // faire refuser par l'index unique 0092. Le CALCUL, lui, ne retient que la période affichée
    // (`periodEntryById` ci-dessous) — le report et la prime n'entrent dans le net que là où ils
    // sont saisis.
    //
    // Pas de `fetchAll`, et c'est borné par la CLÉ : la PK est `(chatter_id, period_start)`, donc
    // au plus UNE ligne par membre et par période — 3 × 96 = 288 lignes au pire (un mois civil
    // contient au plus 3 périodes, `periodsOfMonth`), loin du plafond de 1000. Le plafond ne
    // serait atteint qu'au-delà de 333 chatteurs, où c'est toute la page qu'il faudrait paginer.
    supabase.from('compta_period_entries').select('*').in('period_start', monthPeriodStarts),
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
  if (periodErr) throw new Error(periodErr.message)

  // LE CA DE LA PÉRIODE — hors RLS, cadré applicativement par `linked` (cf. `compta-ca.ts`).
  //
  // ⚠️ `linked` EST LA BARRIÈRE. Il ne contient que les `profiles.chatter_id` déjà renvoyés par
  // la lecture RLS de `profiles` ci-dessus — donc, pour un encadrant, ses rattachés directs et
  // personne d'autre. NE JAMAIS le construire depuis une autre source.
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
    /** Report et prime du mois de LA période affichée, par membre. `Number(...)` : PostgREST
     *  rend les `numeric` en nombre, mais la conversion est explicite partout ailleurs dans ce
     *  fichier — un `numeric` sérialisé en chaîne concaténerait au lieu d'additionner. */
    periodEntryById: new Map(
      (periodEntries ?? [])
        .filter((p) => p.period_start === period.start)
        .map((p) => [
          p.chatter_id,
          { carryover: Number(p.carryover), top3Prime: Number(p.top3_prime) },
        ]),
    ),
    /** Prime du mois saisie sur une AUTRE période du même mois, par membre — l'avertissement de
     *  la fiche. Au plus une (index unique 0092), d'où le `Map` et non une liste. */
    monthlyPrimeElsewhereById: new Map(
      (periodEntries ?? [])
        .filter((p) => p.period_start !== period.start && Number(p.top3_prime) > 0)
        .map((p) => [
          p.chatter_id,
          {
            periodStart: p.period_start,
            periodLabel:
              monthPeriods.find((x) => x.start === p.period_start)?.label ?? p.period_start,
            amount: Number(p.top3_prime),
          },
        ]),
    ),
    /** CA de la période par chatteur MyPuls — une ligne par (JOUR, nom de modèle). Le jour est
     *  ce qui permet de ventiler par segment de taux (0093). */
    caByChatter,
    /** Les 2 lundis de la période — ils bornent la lecture de `compta_week_entries`. Ils
     *  n'entrent dans AUCUN montant depuis la tâche 16 : le fixe est versé par période. */
    mondays,
    days: daysIn(period),
  }
}
