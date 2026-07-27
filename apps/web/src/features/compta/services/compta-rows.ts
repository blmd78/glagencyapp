import { computePayslip, type PayPeriod } from '@glagency/core'
import { buildCoverage, type Coverage } from './coverage'
import { loadComptaSources } from './compta-sources'
import type { ComptaRow, ComptaSanction } from '../types'

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
  const src = await loadComptaSources({ period, memberId })
  const daySet = new Set(src.days)

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
    const fixeSetter = we.reduce((t, w) => t + Number(w.fixe_setter), 0)

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
    const payslip = computePayslip({
      rate: Number(s?.rate ?? 10),
      // Défauts de la colonne quand le membre n'a jamais été réglé : 10 % et aucun fixe.
      fixedAmount: Number(s?.fixed_amount ?? 0),
      modelCa,
      fixeSetter,
      bonus,
      malus,
      handoffs,
      primeDue,
      sanctions: sancRows.reduce((t, x) => t + x.amount, 0),
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
      modelCa,
      sanctions: sancRows,
      weekEntries: Object.fromEntries(
        we.map((w) => [
          w.week_start,
          {
            bonus: Number(w.bonus),
            malus: Number(w.malus),
            handoffs: w.handoffs,
            fixeSetter: Number(w.fixe_setter),
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

  return { rows, coverage }
}
