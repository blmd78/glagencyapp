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

/**
 * « 16 juillet 2026 à 14:05 » — date longue + heure courte fr, TZ Europe/Paris explicite (même
 * piège de TZ serveur que `frDateTimeParis`). Formateur HOISTÉ : il est rendu une fois par ligne
 * de liste (file des candidats), et un `toLocaleString` à options reconstruit un
 * `Intl.DateTimeFormat` à chaque appel.
 */
const dateTimeLongParis = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
})
export const frDateTimeLongParis = (iso: string): string => dateTimeLongParis.format(new Date(iso))

/** « 12/07 » — jour/mois courts fr d'un timestamptz, fuseau Europe/Paris (même piège de TZ
 *  serveur que `frDateTimeParis` : jamais la TZ de Vercel). */
export const frDayMonthParis = (iso: string): string =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Paris',
  })

/**
 * Jours CALENDAIRES Europe/Paris entre deux instants — 0 = même jour Paris, négatif si `to`
 * précède `from`. PAS des blocs de 24 h : à minuit Paris le compteur avance, quel que soit
 * l'écart en heures. Réutilise `todayParis` (en-CA → YYYY-MM-DD) pour projeter chaque
 * instant sur son jour Paris.
 */
export function daysBetweenParis(fromIso: string, toIso: string): number {
  const day = (iso: string): string => todayParis(new Date(iso))
  return Math.round(
    (Date.parse(`${day(toIso)}T00:00:00Z`) - Date.parse(`${day(fromIso)}T00:00:00Z`)) / 86_400_000,
  )
}

/** « 16:05 » — heure courte fr, fuseau LOCAL (affichage client d'un timestamptz). */
export const frTimeShort = (iso: string): string =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

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

/**
 * Même QUANTIÈME, `n` mois plus tard — à ne pas confondre avec `addMonths`, qui ramène au 1er du
 * mois cible (il sert aux sélecteurs de mois). Ici on répond à « un mois après le 15 juin ».
 *
 * ÉCRIT POUR L'ÉCHÉANCE DE LA PRIME D'EMBAUCHE (spec §7, onglet Suivi) : arrivée + 1 mois. Passer
 * par `addMonths` aurait daté toutes les échéances du 1er du mois — un arrivant du 28 juin serait
 * devenu éligible le 1er juillet, trois jours après son arrivée.
 *
 * DÉBORDEMENT : le 31 janvier + 1 mois donne le 28 (ou 29) février, jamais le 3 mars. C'est le
 * comportement de Postgres (`date '2026-01-31' + interval '1 month'`) et celui qu'attend un
 * calendrier de paie ; `setUTCMonth` seul, lui, déborderait sur le mois suivant.
 */
export function addMonthsSameDay(day: string, n: number): string {
  // Cast tuple : une date ISO `YYYY-MM-DD` a toujours 3 segments (contrat d'entrée du module).
  const [y, m, d] = day.slice(0, 10).split('-').map(Number) as [number, number, number]
  // Jour 0 du mois M+1 = dernier jour du mois M — la borne à ne pas dépasser.
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
  return isoDate(new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastDay))))
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

// ── Semaines de référence ────────────────────────────────────────────────────────────────
// L'app manipule TROIS semaines distinctes. Elles étaient re-dérivées à la main dans chaque
// service (repos, health, bilan, générateur d'insights) : les formules ne divergeaient pas,
// mais rien ne NOMMAIT la différence — d'où la question récurrente « pourquoi la S-1 des
// insights n'est pas celle du bilan ? ». Les nommer ici rend l'écart explicite et testable.

/** Lundi de la semaine EN COURS. Repos (planning à remplir), Health (KPIs du moment). */
export const currentWeekStart = (today: string): string => mondayOf(today)

/**
 * Lundi de la S-1 selon l'HORLOGE : la semaine complète qui précède celle d'aujourd'hui.
 * Ne dépend PAS de l'ingestion — le Bilan reste consultable même si la donnée a du retard
 * (la période affichée est alors simplement incomplète, ce qui est lisible et voulu).
 */
export const lastWeekStart = (today: string): string => mondayOf(addDays(today, -7))

/**
 * Lundi de la dernière semaine COMPLÈTEMENT ingérée, déduite du dernier jour de données.
 * Utilisé par le générateur d'insights : analyser une semaine à moitié remplie produirait
 * des « quotas manqués » faux. Ancré sur la donnée et NON sur l'horloge, parce que le run de
 * 23h05 UTC tourne avant minuit — l'horloge basculerait avec un jour de retard.
 *
 * Conséquence assumée : si l'ingestion prend du retard, cette semaine recule alors que
 * `lastWeekStart` avance. Les deux ont raison pour leur usage ; c'est la raison pour laquelle
 * la page Insights peut afficher une semaine antérieure à celle du Bilan.
 */
export const lastFullWeekStartFrom = (maxIngestedDay: string): string => {
  const monday = mondayOf(maxIngestedDay)
  // Le dimanche de cette semaine est-il ingéré ? Sinon, la semaine complète est la précédente.
  return maxIngestedDay >= addDays(monday, 6) ? monday : addDays(monday, -7)
}

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

/**
 * Instant UTC (ISO) du DÉBUT du jour métier Paris `YYYY-MM-DD` — pour borner un `timestamptz`
 * en base sur des jours Paris (audit 2026-08-06 : borner en `T00:00:00Z` range les événements
 * de 0 h–2 h heure de Paris dans la veille). DST géré via Intl : à minuit UTC, Paris affiche
 * 1 h (hiver, UTC+1) ou 2 h (été, UTC+2) → le minuit PARIS de ce jour est cet écart plus tôt.
 * Borne de FIN d'une plage : `parisDayStartUtc(addDays(to, 1))`, EXCLUSIVE (`.lt`).
 */
export function parisDayStartUtc(day: string): string {
  const utcMidnight = new Date(`${day}T00:00:00Z`)
  // `en-GB` : heure NUE sur 24 h (« 01 ») — `fr-FR` ajoute « h » et casserait le Number().
  const parisHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      hour12: false,
    }).format(utcMidnight),
  )
  return new Date(utcMidnight.getTime() - parisHour * 3_600_000).toISOString()
}
