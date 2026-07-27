import { addDays, endOfMonth, frMonthLong, mondayOf, startOfMonth } from '../domain/dates'

/**
 * Quinzaine de paie : rang 1 = du 1er au 15, rang 2 = du 16 à la fin du mois.
 * Toujours deux par mois, sans trou ni recouvrement (spec §3).
 */
export interface Fortnight {
  /** 1er jour du MOIS — sert de clé avec `period` (colonnes `month`/`period`). */
  month: string
  period: 1 | 2
  from: string
  to: string
  /** « 1–15 juillet 2026 ». */
  label: string
}

const make = (month: string, period: 1 | 2, from: string, to: string): Fortnight => ({
  month,
  period,
  from,
  to,
  label: `${Number(from.slice(8, 10))}–${Number(to.slice(8, 10))} ${frMonthLong(from)}`,
})

/** Quinzaine contenant ce jour. */
export function fortnightOf(day: string): Fortnight {
  const month = startOfMonth(day)
  const ym = day.slice(0, 7)
  return Number(day.slice(8, 10)) <= 15
    ? make(month, 1, `${ym}-01`, `${ym}-15`)
    : make(month, 2, `${ym}-16`, endOfMonth(day))
}

/** Les deux quinzaines d'un mois, dans l'ordre. `month` = n'importe quel jour du mois. */
export function fortnightsOfMonth(month: string): [Fortnight, Fortnight] {
  const ym = month.slice(0, 7)
  return [fortnightOf(`${ym}-01`), fortnightOf(`${ym}-16`)]
}

/**
 * Lundis dont la SEMAINE est rattachée à cette quinzaine. Une semaine à cheval part
 * entièrement avec son lundi — jamais découpée (spec §3). Une quinzaine peut donc en
 * contenir 2 ou 3.
 */
export function mondaysIn(f: Fortnight): string[] {
  const out: string[] = []
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) if (mondayOf(d) === d) out.push(d)
  return out
}

/** Tous les jours de la quinzaine, bornes incluses. */
export function daysIn(f: Fortnight): string[] {
  const out: string[] = []
  for (let d = f.from; d <= f.to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Les `n` dernières quinzaines, la plus récente d'abord — alimente le sélecteur de période. */
export function recentFortnights(today: string, n = 12): Fortnight[] {
  const out: Fortnight[] = []
  let cur = fortnightOf(today)
  for (let i = 0; i < n; i++) {
    out.push(cur)
    cur = fortnightOf(addDays(cur.from, -1))
  }
  return out
}
