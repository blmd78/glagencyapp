import { addDays, addMonths, endOfMonth, frDayMonthShort, frWeekdayDate, mondayOf } from '@glagency/core'
import type { AgencyRole } from './schema'

export type AgencyEvent = {
  id: string
  title: string
  startDate: string
  endDate: string
  remindOnDay: boolean
  audience: AgencyRole[]
}

/** La part d'un événement dans UNE semaine de la grille. */
export type EventBar = {
  event: AgencyEvent
  /** Colonne de départ, 0 = lundi. */
  startCol: number
  span: number
  /** Ligne d'empilement dans la semaine (0 = la plus haute). */
  lane: number
  continuesBefore: boolean
  continuesAfter: boolean
}

export type WeekRow = { days: string[]; bars: EventBar[]; lanes: number }

/** Bornes de la grille d'un mois (`AAAA-MM`) : du lundi de sa 1re semaine au dimanche de sa dernière. */
export function monthGrid(month: string): { start: string; end: string } {
  const first = `${month}-01`
  return { start: mondayOf(first), end: addDays(mondayOf(endOfMonth(first)), 6) }
}

/**
 * Les semaines du mois et, pour chacune, ses barres d'événements. Une période qui passe d'une
 * semaine à l'autre y est coupée en autant de barres. Empilement glouton : chaque barre prend la
 * première ligne libre ; les événements les plus tôt, puis les plus longs, passent en premier.
 */
export function layoutMonth(month: string, events: AgencyEvent[]): WeekRow[] {
  const { start, end } = monthGrid(month)
  const sorted = [...events].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      b.endDate.localeCompare(a.endDate) ||
      a.title.localeCompare(b.title, 'fr'),
  )
  const rows: WeekRow[] = []
  for (let weekStart = start; weekStart <= end; weekStart = addDays(weekStart, 7)) {
    const weekEnd = addDays(weekStart, 6)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const laneEnds: string[] = []
    const bars: EventBar[] = []
    for (const event of sorted) {
      if (event.endDate < weekStart || event.startDate > weekEnd) continue
      const from = event.startDate > weekStart ? event.startDate : weekStart
      const to = event.endDate < weekEnd ? event.endDate : weekEnd
      let lane = laneEnds.findIndex((last) => last < from)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(to)
      } else laneEnds[lane] = to
      bars.push({
        event,
        startCol: days.indexOf(from),
        span: days.indexOf(to) - days.indexOf(from) + 1,
        lane,
        continuesBefore: event.startDate < weekStart,
        continuesAfter: event.endDate > weekEnd,
      })
    }
    rows.push({ days, bars, lanes: laneEnds.length })
  }
  return rows
}

/** Le mois de l'URL s'il est bien formé (`AAAA-MM`), sinon celui du jour (heure de Paris). */
export function parseMonth(value: string | undefined, today: string): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7)
}

export const shiftMonth = (month: string, n: number): string => addMonths(`${month}-01`, n).slice(0, 7)

/** « mercredi 14 octobre » pour un jour, « 17 oct. → 20 oct. » pour une période. */
export function formatEventDates(start: string, end: string): string {
  return start === end ? frWeekdayDate(start) : `${frDayMonthShort(start)} → ${frDayMonthShort(end)}`
}
