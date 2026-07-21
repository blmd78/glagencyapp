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

/** « 22 juin » — jour + mois court fr (pour les axes de graphes). */
export const frDayMonthShort = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

/** « 22 juin » — jour + mois en toutes lettres fr. */
export const frDayLong = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

/** « lun. 22/06 » — jour de semaine court + jour/mois. */
export const frWeekdayShort = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

/** « lundi 22/06 » — jour de semaine long + jour/mois. */
export const frWeekdayLong = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

/** « lundi 29 juin » — jour de semaine long + jour + mois en toutes lettres. */
export const frWeekdayDate = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

/** « 29/06/2026 » — date numérique complète fr. */
export const frDateNumeric = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })

/**
 * « 16/07 14:05 » — date + heure courtes fr, TZ Europe/Paris explicite (jamais la TZ
 * serveur = UTC sur Vercel — même piège que `todayParis`). `iso` = timestamptz Postgres
 * (`toLocaleString` accepte l'offset, pas de troncature `T00:00:00Z` comme les helpers
 * jour ci-dessus).
 */
export const frDateTimeParis = (iso: string): string =>
  new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  })

/** Premier jour du mois de `day` (YYYY-MM-01). */
export const startOfMonth = (day: string): string => `${day.slice(0, 7)}-01`

/** Dernier jour du mois de `day`. */
export function endOfMonth(day: string): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return isoDate(d)
}

/** Décale de `n` mois et retourne le 1er du mois cible (YYYY-MM-01). `setUTCMonth` gère le
 *  passage d'année (déc → jan) et normalise (on part du 1er, pas de débordement de fin de mois). */
export function addMonths(day: string, n: number): string {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return isoDate(d)
}

/** « juillet 2026 » — mois en toutes lettres + année (pour le sélecteur de mois). */
export const frMonthLong = (day: string): string =>
  new Date(`${day.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** Nombre de jours (inclusif) entre deux jours `from`..`to`. */
export const daysBetween = (from: string, to: string): number =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  )

/** « sem. 22/06–28/06 » — libellé compact d'une semaine à partir de son lundi. */
export const weekLabel = (start: string): string =>
  `sem. ${frDayShort(start)}–${frDayShort(addDays(start, 6))}`

export const round1 = (n: number): number => Math.round(n * 10) / 10
export const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Jour civil « métier » de l'agence = Europe/Paris (YYYY-MM-DD).
 * À utiliser pour TOUT « aujourd'hui » — jamais `isoDate(new Date())` (UTC : entre
 * minuit et 2h heure de Paris, le jour UTC est encore la veille → KPIs du jour faux).
 * `en-CA` : locale dont le format court est déjà YYYY-MM-DD.
 */
export const todayParis = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
