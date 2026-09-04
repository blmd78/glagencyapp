import { addDays } from '../domain/dates'

/**
 * Décalage Paris↔UTC (ms) À CET INSTANT. On formate l'instant en composantes horaires de Paris,
 * on relit ces composantes comme si elles étaient UTC, et la différence EST le décalage.
 */
// Formateur HOISTÉ et résultat MÉMOÏSÉ À L'HEURE.
//
// Construire un Intl.DateTimeFormat coûte ~61 µs et `formatToParts` ~3,7 µs ; une nuit
// d'ingestion demandait ~25 000 conversions, soit ~785 ms en reconstruisant le formateur et
// encore ~92 ms en le hoistant — contre les 10 ms de CPU qu'accorde le plan Cloudflare Free.
// L'isolate mourait avant la première écriture.
//
// Le décalage Paris↔UTC est CONSTANT à l'intérieur d'une heure UTC, y compris les deux jours de
// bascule : la transition tombe pile à 01:00 UTC. Mémoïser par heure est donc exact, et ramène
// 25 000 conversions à une cinquantaine.
const PARIS_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const OFFSET_BY_HOUR = new Map<number, number>()

export function parisOffsetMs(at: Date): number {
  const hour = Math.floor(at.getTime() / 3_600_000)
  const memo = OFFSET_BY_HOUR.get(hour)
  if (memo !== undefined) return memo
  const parts = PARIS_PARTS.formatToParts(at)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // `hour12: false` rend « 24 » pour minuit sur certaines versions d'ICU — `% 24` neutralise.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  const offset = asUtc - at.getTime()
  // Borne de sécurité : le cache ne doit pas grossir indéfiniment dans un process long.
  if (OFFSET_BY_HOUR.size > 20_000) OFFSET_BY_HOUR.clear()
  OFFSET_BY_HOUR.set(hour, offset)
  return offset
}

/**
 * Instant UTC (ms) de l'heure MURALE `hour` du jour Paris `day`.
 *
 * Deux passes, et c'est indispensable : le décalage à appliquer est celui de l'instant VISÉ, pas
 * celui de minuit UTC. Les deux jours de bascule d'heure durent 23 h ou 25 h — une simple addition
 * de `hour × 3 600 000` sur le début de journée y décale toutes les bornes de shift d'une heure.
 */
export function parisWallUtcMs(day: string, hour: number): number {
  const naive = Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000
  const firstPass = naive - parisOffsetMs(new Date(naive))
  return naive - parisOffsetMs(new Date(firstPass))
}

/** Jour civil Paris (YYYY-MM-DD) d'un instant ISO. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const parisDay = (iso: string): string => PARIS_DAY.format(new Date(iso))

/** Bornes UTC (ms) de la journée Paris `day`. `end` est EXCLUSIVE. */
export function dayBounds(day: string): { start: number; end: number } {
  return { start: parisWallUtcMs(day, 0), end: parisWallUtcMs(addDays(day, 1), 0) }
}

/** Numéro de jour ISO (1 = lundi, 7 = dimanche). Pure arithmétique de chaîne : pas de fuseau. */
export const isoWeekday = (day: string): number =>
  ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

/** « 13:00 » — heure de Paris. */
export const fmtClock = (ms: number | null): string =>
  ms == null
    ? '—'
    : new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ms))

/** 487 → « 8h07 » ; 45 → « 45min ». */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  return h ? `${h}h${String(rest).padStart(2, '0')}` : `${rest}min`
}
