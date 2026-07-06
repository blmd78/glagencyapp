/** Helpers de dates hebdo (UTC, format YYYY-MM-DD) — source unique pour web + ingestion.
 *  Convention agence : semaines du LUNDI au DIMANCHE. */

export const isoDate = (d: Date): string => d.toISOString().slice(0, 10)

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return isoDate(d)
}

/** Lundi de la semaine du jour donné. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return isoDate(d)
}

/** « 22/06 » — jour/mois court fr. */
export const frDayShort = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

/** « sem. 22/06–28/06 » — libellé compact d'une semaine à partir de son lundi. */
export const weekLabel = (start: string): string =>
  `sem. ${frDayShort(start)}–${frDayShort(addDays(start, 6))}`

export const round1 = (n: number): number => Math.round(n * 10) / 10
export const round2 = (n: number): number => Math.round(n * 100) / 100
