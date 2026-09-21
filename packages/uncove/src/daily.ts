import type { SubsDay } from './endpoints/subscriptions'
import type { RevenueDay } from './endpoints/transactions'

/** Ligne journalière fusionnée d'un compte : abonnés + CA du jour. */
export interface DailyRow {
  day: string
  new: number
  canceled: number
  current: number
  revenue: number
}

/** Fusionne les séries Subs et CA par jour : union des jours, valeurs manquantes à 0, tri croissant. */
export function mergeDaily(subs: SubsDay[], revenue: RevenueDay[]): DailyRow[] {
  const bySub = new Map(subs.map((s) => [s.day, s]))
  const byRev = new Map(revenue.map((r) => [r.day, r.revenue]))
  const days = [...new Set([...bySub.keys(), ...byRev.keys()])].sort((a, b) => a.localeCompare(b))
  return days.map((day) => {
    const s = bySub.get(day)
    return {
      day,
      new: s?.new ?? 0,
      canceled: s?.canceled ?? 0,
      current: s?.current ?? 0,
      revenue: byRev.get(day) ?? 0,
    }
  })
}
