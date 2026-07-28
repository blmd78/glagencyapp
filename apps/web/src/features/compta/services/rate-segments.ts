import { rateSpans, type RateChange, type RateSegmentInput } from '@glagency/core'

/** Une ligne de CA telle que `compta-sources.ts` la rend : le JOUR est conservé, c'est lui qui
 *  permet de ranger le chiffre d'affaires dans le bon segment de taux. */
export interface CaLine {
  date: string
  model: string
  ca: number
}

/**
 * Découpe le CA d'un membre par SEGMENT DE TAUX — l'entrée de `computePayslip` depuis 0093.
 *
 * FICHIER À PART de `compta-rows.ts` (qui atteignait le plafond de 300 lignes, CLAUDE.md) et
 * hors de `packages/core` : le cœur pur connaît le découpage en jours (`rateSpans`) et la
 * formule (`computePayslip`), mais pas la FORME sous laquelle la compta lit son CA — c'est une
 * frontière de la couche web.
 *
 * Deux étapes, et l'ordre compte : d'abord les segments de jours (`rateSpans`, qui ne connaît
 * que les dates d'effet), ensuite le CA rangé dans celui de ses segments qui contient son jour.
 * Le CA n'influence donc JAMAIS le découpage — un modèle sans chiffre d'affaires sur un segment
 * n'y fait pas de ligne, mais le segment existe quand même.
 *
 * ⚠️ SEGMENTS VIDES ÉCARTÉS, et c'est pour la lisibilité de la fiche : un chatteur augmenté au
 * 13/07 qui n'a travaillé que la seconde semaine aurait sinon un bloc « du 6 au 12 juillet —
 * 10 % — 0,00 € » en tête de sa fiche. Rien n'est perdu (0 € × n'importe quel taux = 0 €), et
 * le cas usuel — un seul taux — reste un seul bloc.
 */
export function segmentsOf(
  days: string[],
  history: RateChange[],
  ca: CaLine[],
): RateSegmentInput[] {
  const spans = rateSpans(days, history)
  const byModel = spans.map(() => new Map<string, number>())
  for (const line of ca) {
    const i = spans.findIndex((s) => s.from <= line.date && line.date <= s.to)
    // `-1` = un jour hors période. Impossible en pratique (la lecture est bornée par
    // `gte(from)/lte(to)`), mais l'ignorer en silence vaut mieux que de le ranger dans le
    // premier segment venu — au mauvais taux.
    if (i < 0) continue
    const m = byModel[i]
    if (!m) continue
    m.set(line.model, (m.get(line.model) ?? 0) + line.ca)
  }
  return spans.flatMap((s, i) => {
    const m = byModel[i]
    if (!m || m.size === 0) return []
    return [
      { from: s.from, to: s.to, rate: s.rate, fallback: s.fallback, modelCa: Object.fromEntries(m) },
    ]
  })
}
