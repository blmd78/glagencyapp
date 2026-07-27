import { computePayslip, daysIn, type Fortnight } from '@glagency/core'
import { buildCoverage, type Coverage } from './coverage'
import { loadComptaSources } from './compta-sources'
import type { ComptaRow, ComptaSanction } from '../types'

/**
 * LE calcul de la compta — une fiche de paie par membre sur une quinzaine. Appelé DEUX FOIS
 * avec le même code :
 *  - par `getCompta`, pour la page (tous les membres) ;
 *  - par `payFortnight`, pour RECALCULER côté serveur le membre qu'on s'apprête à payer
 *    (`memberId`) et refuser un montant qui ne correspond plus.
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
  fortnight,
  choices,
  today,
  memberId,
}: {
  fortnight: Fortnight
  /** Fenêtre de quinzaines proposées — sert à situer la prime (cf. `myOldestOpen`). */
  choices: Fortnight[]
  today: string
  /** Restreint la population à UN membre (recalcul serveur d'un paiement). */
  memberId?: string
}): Promise<ComptaRowsResult> {
  const src = await loadComptaSources({ fortnight, memberId })
  const daySet = new Set(src.days)

  // Jours couverts par membre, primes déjà versées, et « cette quinzaine le concerne-t-il ? » —
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

    // Couverture de CE membre (map précalculée ci-dessus) — sert à la prime. `myPayments`
    // (liste, pas set) reste nécessaire séparément pour `covered`/`paid`/`paidOn` plus bas,
    // qui ont besoin du `paid_at` PAR jour, pas juste de son appartenance à l'ensemble couvert.
    const myPayments = mine(src.payments)
    const myCoveredDays = coverage.daysByMember.get(m.id) ?? new Set<string>()
    // La prime ne s'affiche que sur la quinzaine ÉCHUE LA PLUS ANCIENNE non couverte DE CE
    // MEMBRE (spec §4). Sans le filtre ÉCHUE (`f.to < today`), la quinzaine en cours — jamais
    // encore couverte puisqu'elle n'est pas terminée — la déclencherait en permanence, même à
    // jour de paie. Sans le calcul PAR MEMBRE, le paiement d'un collègue masquerait la
    // quinzaine impayée d'un autre et déplacerait sa prime. Sans `concerns`, elle remontait
    // jusqu'aux quinzaines d'AVANT son embauche et s'affichait sur une période que personne
    // ne regarde, au lieu de la première réellement travaillée. `choices` est trié du plus
    // récent au plus ancien → filtré puis inversé, la première trouvée est la plus ancienne.
    const myOldestOpen = [...choices]
      .filter((f) => f.to < today && coverage.concerns(m.id, f))
      .reverse()
      .find((f) => daysIn(f).some((d) => !myCoveredDays.has(d)))
    // `!coverage.primePaid.has(...)` est la condition DÉCISIVE contre le double versement (cf.
    // `coverage.ts`) : un membre dont la prime est déjà partie ne peut plus la redéclencher,
    // quel que soit l'état de `compta_primes`.
    const primeApplies =
      !coverage.primePaid.has(m.id) &&
      myOldestOpen != null &&
      myOldestOpen.month === fortnight.month &&
      myOldestOpen.period === fortnight.period

    const modelCa = m.chatter_id ? (src.caByChatter.get(m.chatter_id) ?? {}) : {}
    const payslip = computePayslip({
      mode: s?.mode === 'fixed' ? 'fixed' : 'percent',
      rate: Number(s?.rate ?? 10),
      fixedAmount: Number(s?.fixed_amount ?? 0),
      isSetter: s?.is_setter ?? false,
      weekCount: src.mondays.length,
      modelCa,
      fixeSetter,
      bonus,
      malus,
      handoffs,
      primeDue: primeApplies ? (src.primeById.get(m.id) ?? 0) : 0,
      sanctions: sancRows.reduce((t, x) => t + x.amount, 0),
    })

    // Couverture : la quinzaine est payée si CHACUN de ses jours figure dans un `covered_days`.
    const covered = new Map<string, string>()
    for (const p of myPayments) {
      for (const d of (p.covered_days as string[] | null) ?? []) if (daySet.has(d)) covered.set(d, p.paid_at)
    }
    const paid = src.days.every((d) => covered.has(d))
    // `payments` couvre TOUTES les quinzaines (nécessaire à `overdue`) — restreindre à celle-ci.
    // Au PLURIEL : un règlement partiel puis son complément font deux lignes (spec §3 et §10),
    // que le trigger 0087 autorise tant que les jours ne se chevauchent pas. Prendre le premier
    // sous-déclarerait ce qui a été versé.
    const thisPayments = myPayments.filter(
      (p) => p.month === fortnight.month && p.period === fortnight.period,
    )

    return {
      id: m.id,
      name: m.display_name ?? m.email ?? '—',
      role: m.role,
      chatterId: m.chatter_id,
      mode: s?.mode === 'fixed' ? 'fixed' : 'percent',
      rate: Number(s?.rate ?? 10),
      fixedAmount: Number(s?.fixed_amount ?? 0),
      isSetter: s?.is_setter ?? false,
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
      // Le DERNIER versement, pas celui qui couvre le premier jour : réglée en deux fois, la
      // quinzaine n'est soldée qu'au complément. Les `paid_at` sont des `YYYY-MM-DD`, donc
      // l'ordre lexicographique est l'ordre chronologique.
      paidOn: paid ? ([...covered.values()].sort().at(-1) ?? null) : null,
      paidAmount: thisPayments.length
        ? thisPayments.reduce((s, p) => s + Number(p.amount), 0)
        : null,
    }
  })

  return { rows, coverage }
}
