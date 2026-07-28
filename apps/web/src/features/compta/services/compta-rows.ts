import { computePayslip, monthOfPeriod, type PayPeriod, type SetterScaleRow } from '@glagency/core'
import { buildCoverage, type Coverage } from './coverage'
import { loadComptaSources } from './compta-sources'
import { loadSetterRanking } from './setter-ranking'
import type { ComptaRow, ComptaSanction, SetterRankingRow } from '../types'

/**
 * LE calcul de la compta — une fiche de paie par membre sur une période de paie. Appelé TROIS
 * FOIS avec le même code :
 *  - par `getCompta`, pour la page (tous les membres) ;
 *  - par `payPeriod`, pour RECALCULER côté serveur le membre qu'on s'apprête à payer
 *    (`memberId`) et refuser un montant qui ne correspond plus ;
 *  - par `payAllForPeriod` (paiement groupé), SANS `memberId` : le lot recalcule toute la
 *    population et ne verse que ce résultat-là — aucun montant ne transite par le navigateur.
 *
 * Une seconde implémentation du calcul serait pire que pas de vérification du tout : elle
 * divergerait un jour et bloquerait des paiements corrects, ou en laisserait passer de faux.
 * Les lectures vivent dans `compta-sources.ts`.
 */

/** Motifs de sanction — copie locale : `features/police` est une AUTRE feature, import interdit
 *  (ESLint `import-x/no-restricted-paths`). Garder aligné sur `features/police/types.ts`. */
const ERROR_LABEL: Record<string, string> = {
  media_argent: 'Parle de média/argent directement',
  reactivite: 'Réponse > 45 s par sub',
  media_rapide: 'Envoi de média trop rapide',
  fautes: "Fautes d'orthographe",
  setter_lent: 'Ne récupère pas vite les nouveaux (setter)',
  hors_script: "Ne suit pas l'histoire du script",
  sexu_faible: 'Sexualisation faible (ne fait pas baver)',
  promesse: 'Promesse non tenue (setter)',
  temps_media: "N'attend pas le temps du média",
  infos_non_transmises: 'Ne transmet pas les infos',
  infos_non_notees: 'Ne note pas les infos',
}

export interface ComptaRowsResult {
  rows: ComptaRow[]
  /** Couverture des paiements — `getCompta` en a besoin pour le bandeau de retard. */
  coverage: Coverage
  /** L'onglet Classement — les membres VISIBLES qui ont au moins un handoff sur la période, avec
   *  leur rang AGENCE-WIDE (cf. `setter-ranking.ts`). Trié par rang croissant. */
  setterRanking: SetterRankingRow[]
  /** Le barème tel qu'il est en base — affiché par l'onglet Classement, éditable par l'admin. */
  setterScale: SetterScaleRow[]
}

export async function loadComptaRows({
  period,
  today,
  memberId,
}: {
  period: PayPeriod
  today: string
  /** Restreint la population à UN membre (recalcul serveur d'un paiement). */
  memberId?: string
}): Promise<ComptaRowsResult> {
  // EN PARALLÈLE, et jamais en série : les deux lectures sont indépendantes (le classement ne
  // dépend d'aucune sortie de `loadComptaSources`), et le paiement groupé rejoue toute cette
  // chaîne. Le classement est AGENCE-WIDE même quand `memberId` restreint la population à une
  // personne — c'est indispensable au recalcul serveur du paiement : le rang d'un membre dépend
  // des handoffs de tous les autres, et le calculer sur lui seul lui donnerait le rang 1.
  const [src, ranking] = await Promise.all([
    loadComptaSources({ period, memberId }),
    loadSetterRanking(period),
  ])
  const daySet = new Set(src.days)
  // Mois de la période affichée (celui de son lundi de départ) — la clé du garde anti-double
  // versement de la prime DU MOIS, ci-dessous.
  const monthKey = monthOfPeriod(period).key

  // Jours couverts par membre, primes déjà versées, et « cette période le concerne-t-elle ? » —
  // un seul regroupement sur `payments` (au lieu de le refiltrer pour chaque ligne). Le détail
  // et le POURQUOI de chaque sortie sont dans `coverage.ts`.
  const coverage = buildCoverage({
    members: src.members,
    payments: src.payments,
    firstSeen: src.firstSeen,
  })

  const rows: ComptaRow[] = src.members.map((m) => {
    const s = src.settingsById.get(m.id)
    // Générique : une signature figée `(arr: { chatter_id: string }[])` écraserait le type
    // réel des lignes (bonus/malus/occurred_on/covered_days/…) au retour — chaque appelant
    // perdrait ses champs propres. `<T extends { chatter_id: string }>` les préserve.
    const mine = <T extends { chatter_id: string }>(arr: T[]) => arr.filter((x) => x.chatter_id === m.id)

    const de = mine(src.dayEntries)
    const we = mine(src.weekEntries)
    const bonus = de.reduce((t, d) => t + Number(d.bonus), 0) + we.reduce((t, w) => t + Number(w.bonus), 0)
    const malus = de.reduce((t, d) => t + Number(d.malus), 0) + we.reduce((t, w) => t + Number(w.malus), 0)
    const handoffs = de.reduce((t, d) => t + d.handoffs, 0) + we.reduce((t, w) => t + w.handoffs, 0)
    // `compta_week_entries.fixe_setter` N'EST PLUS LU (2026-07-28, tâche 19). Il l'était par
    // une somme sur les 2 semaines de la période — alors que le fixe est un montant PAR
    // PÉRIODE : le champ de saisie, hebdomadaire, s'affichait donc deux fois et retaper le
    // même 75 € sur chaque ligne versait 150 €. Le fixe vient désormais des seuls réglages
    // (`compta_settings.fixed_amount`, ci-dessous). La colonne reste en base — historique.

    const sancRows: ComptaSanction[] = mine(src.sanctions).map((e) => ({
      day: e.occurred_on,
      label: e.error_key ? (ERROR_LABEL[e.error_key] ?? e.error_key) : null,
      amount: Number(e.amount_eur),
      kind: e.kind === 'warning' ? 'warning' : 'malus',
    }))

    // `myPayments` (liste, pas set) sert `covered`/`paid`/`paidOn` plus bas, qui ont besoin du
    // `paid_at` PAR jour, pas seulement de l'appartenance du jour à l'ensemble couvert.
    const myPayments = mine(src.payments)

    // ── LA PRIME S'AFFICHE SUR LA PÉRIODE CONSULTÉE ─────────────────────────────────────────
    // Deux conditions, et deux seulement (spec §4, écart arbitré par Benoit le 2026-07-27) :
    // la période affichée est ÉCHUE, et le membre n'a JAMAIS reçu de prime.
    //
    // La règle précédente l'ancrait sur « la période échue la plus ancienne non couverte de
    // ce membre ». Elle est inutilisable à l'amorçage : tant qu'aucun paiement n'existe, la
    // plus ancienne non couverte est la plus vieille de la fenêtre (12 périodes en arrière),
    // que personne n'ouvre — la prime restait donc invisible partout où on la cherchait.
    //
    // `!coverage.primePaid.has(...)` est LE garde contre le double versement, inchangé : sa
    // source de vérité est l'instantané figé `compta_payments.prime_amount` (cf. `coverage.ts`),
    // pas la position de la période ni `compta_primes.status`. La prime reste donc versable
    // une seule fois, quelle que soit la période par laquelle on passe.
    //
    // `coverage.concerns` n'est PLUS appliqué ici : il ne servait qu'à empêcher l'ancrage
    // automatique sur une période d'avant l'embauche, alors que la période est désormais
    // choisie par l'admin. L'y garder aurait privé de prime tout membre sans date d'entrée
    // (aucun jour dans `chatter_daily`), ce que la spec §10 rend dû malgré tout : « Période
    // sans aucune donnée CA → net = 0 […] les bonus/primes restent dus ».
    //
    // `period.end < today` = le même prédicat « période échue » que `periodElapsed`
    // (`get-compta.ts`), `overduePeriods` et le garde de `payPeriod`.
    const primeApplies = !coverage.primePaid.has(m.id) && period.end < today
    const prime = src.primeById.get(m.id) ?? null
    // Le filtre `status = 'due'` vit ICI depuis que `compta-sources.ts` lit tous les statuts
    // (le formulaire admin a besoin de l'état réel) : une prime `'paid'` ou `'skipped'` ne
    // rentre pas dans le calcul.
    const primeDue = primeApplies && prime?.status === 'due' ? prime.amount : 0

    const modelCa = m.chatter_id ? (src.caByChatter.get(m.chatter_id) ?? {}) : {}

    // ── LES TROIS LIGNES DU LOT FINAL, BRANCHÉES (tâche 23) ─────────────────────────────────
    // Le report et la prime du mois sont une SAISIE de la période (`compta_period_entries`,
    // 0090) ; la prime setter est CALCULÉE, elle ne se saisit nulle part — c'est la tranche du
    // barème au rang du membre dans les handoffs de la période (cf. `setter-ranking.ts`).
    // L'instantané de paiement les fige toutes les trois depuis 0091 : sans ces colonnes, le
    // `superRefine` de `payInput` aurait refusé toute fiche qui en porte une.
    const entry = src.periodEntryById.get(m.id)
    const setterRank = ranking.byMember.get(m.id) ?? null

    // ── LA PRIME DU MOIS NE SE VERSE QU'UNE FOIS PAR MOIS ───────────────────────────────────
    // Un mois civil contient 2 OU 3 périodes de 14 jours (`periodsOfMonth`), et `top3_prime` se
    // saisit PAR PÉRIODE : sans garde, la même prime mensuelle peut partir deux fois.
    //
    // DEUX VERROUS, et il en faut deux :
    //  1. l'index unique 0092 interdit de la SAISIR sur deux périodes du même mois ;
    //  2. celui-ci interdit de la VERSER une seconde fois — ce que l'index ne peut pas voir :
    //     rien n'empêche de payer la période 1, de remettre sa saisie à 0, puis de saisir la
    //     prime sur la période 2 du même mois. La saisie a bougé, le PAIEMENT non.
    //
    // Source de vérité : l'instantané figé `compta_payments.monthly_prime_amount`, jamais la
    // saisie — exactement le raisonnement de `coverage.primePaid` pour la prime d'embauche
    // (cf. `coverage.ts`). Conséquence assumée, identique à celle de la prime d'embauche : sur
    // une période DÉJÀ payée, le net recalculé n'affiche plus cette prime, alors que
    // l'instantané, lui, l'a bien versée — c'est l'instantané qui fait foi, et la fiche le dit
    // déjà (« Payé le … — X € »).
    const monthlyPrimePaid = coverage.monthlyPrimePaid.get(m.id)?.has(monthKey) ?? false
    const monthlyPrime = monthlyPrimePaid ? 0 : (entry?.top3Prime ?? 0)

    const payslip = computePayslip({
      rate: Number(s?.rate ?? 10),
      // Défauts de la colonne quand le membre n'a jamais été réglé : 10 % et aucun fixe.
      fixedAmount: Number(s?.fixed_amount ?? 0),
      modelCa,
      bonus,
      malus,
      handoffs,
      primeDue,
      sanctions: sancRows.reduce((t, x) => t + x.amount, 0),
      carryover: entry?.carryover ?? 0,
      setterPrime: setterRank?.amount ?? 0,
      monthlyPrime,
    })

    // Couverture : la période est payée si CHACUN de ses jours figure dans un `covered_days`.
    const covered = new Map<string, string>()
    for (const p of myPayments) {
      for (const d of (p.covered_days as string[] | null) ?? []) if (daySet.has(d)) covered.set(d, p.paid_at)
    }
    const paid = src.days.every((d) => covered.has(d))
    // `payments` couvre TOUTES les périodes (nécessaire à `overdue`) — restreindre à celle-ci.
    // Le lundi de départ EST la clé d'une période depuis 0088 (`period_start`), là où il
    // fallait auparavant comparer le couple `(month, period 1|2)`.
    // Au PLURIEL : un règlement partiel puis son complément font deux lignes (spec §3 et §10),
    // que le trigger 0087 autorise tant que les jours ne se chevauchent pas. Prendre le premier
    // sous-déclarerait ce qui a été versé.
    const thisPayments = myPayments.filter((p) => p.period_start === period.start)

    return {
      id: m.id,
      name: m.display_name ?? m.email ?? '—',
      role: m.role,
      chatterId: m.chatter_id,
      rate: Number(s?.rate ?? 10),
      fixedAmount: Number(s?.fixed_amount ?? 0),
      prime,
      handoffs,
      // Valeurs de DÉPART du formulaire de saisie de la période (fiche dépliée). Absente en base
      // = deux zéros, jamais `null` : le formulaire a besoin d'un nombre, et 0 est exactement ce
      // que la ligne vaut tant qu'elle n'existe pas (défauts de colonne, 0090).
      periodEntry: entry ?? { carryover: 0, top3Prime: 0 },
      // Les deux raisons pour lesquelles une prime du mois SAISIE peut ne pas entrer dans ce net
      // — la fiche les affiche, sans quoi le champ rempli et la ligne absente se contrediraient
      // en silence.
      monthlyPrimePaid,
      monthlyPrimeElsewhere: src.monthlyPrimeElsewhereById.get(m.id) ?? null,
      // Le rang, pour que la fiche puisse écrire « Prime setter — rang 6 » plutôt qu'un montant
      // sans provenance. `null` = pas classé (aucun handoff sur la période).
      setterRank: setterRank ? { rank: setterRank.rank, handoffs: setterRank.handoffs } : null,
      modelCa,
      sanctions: sancRows,
      weekEntries: Object.fromEntries(
        we.map((w) => [
          w.week_start,
          {
            bonus: Number(w.bonus),
            malus: Number(w.malus),
            handoffs: w.handoffs,
            note: w.note,
          },
        ]),
      ),
      payslip,
      paid,
      // `covered` ne contient que les jours DE CETTE PÉRIODE (filtrés par `daySet` juste
      // au-dessus) : non vide = le trigger 0087 refuserait de recouvrir la période entière.
      anyDayPaid: covered.size > 0,
      // Le DERNIER versement, pas celui qui couvre le premier jour : réglée en deux fois, la
      // période n'est soldée qu'au complément. Les `paid_at` sont des `YYYY-MM-DD`, donc
      // l'ordre lexicographique est l'ordre chronologique.
      paidOn: paid ? ([...covered.values()].sort().at(-1) ?? null) : null,
      paidAmount: thisPayments.length
        ? thisPayments.reduce((s, p) => s + Number(p.amount), 0)
        : null,
    }
  })

  // ── LE CLASSEMENT, RESTREINT À CE QUE L'APPELANT A LE DROIT DE VOIR ───────────────────────
  // `ranking.byMember` est calculé sur TOUTE l'agence (il le faut, cf. `setter-ranking.ts`),
  // mais on ne rend ici que les membres déjà renvoyés par la RLS `profiles` — la même barrière
  // applicative que le CA et les noms de modèles. Un manager voit donc ses rattachés avec leur
  // rang RÉEL, ce qui fait des trous dans la numérotation (1, 5, 9…) : c'est le prix, assumé,
  // d'un rang qui veut dire quelque chose. L'écran le dit en toutes lettres.
  const setterRanking: SetterRankingRow[] = rows
    .flatMap((r) => {
      const rank = ranking.byMember.get(r.id)
      return rank ? [{ id: r.id, name: r.name, handoffs: rank.handoffs, rank: rank.rank, amount: rank.amount }] : []
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'fr'))

  return { rows, coverage, setterRanking, setterScale: ranking.scale }
}
