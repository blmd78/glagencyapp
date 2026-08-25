import { DEFAULT_STALE_MS, buildSegments, liveFromEvents } from './segments'
import { parisDay } from './time'
import type { LiveStatus, Segment, TrackerEvent } from './types'

/**
 * Journée d'un manager : des FAITS, aucun verdict.
 *
 * Pas de quota, pas de seuil, pas de conformité, pas de créneau. On restitue l'heure de début,
 * l'heure de fin, les pauses et l'inactivité ; l'admin juge lui-même.
 *
 * Un shift est rattaché EN ENTIER au jour où il a COMMENCÉ : un shift de nuit qui démarre le 16 à
 * 22 h et termine le 17 à 4 h appartient au 16, sans coupure à minuit.
 *
 * `workedMinutes` est exactement ce que le manager voit sur son chrono : le temps écoulé moins les
 * pauses. L'inactivité n'arrête pas le chrono — elle est relevée ici sans jamais lui être montrée.
 */

export interface ManagerSpan {
  start: number
  end: number
  minutes: number
}

export interface ManagerDay {
  date: string
  started: number | null
  ended: number | null
  openShift: boolean
  crashed: boolean
  recovered: boolean
  /**
   * État à l'instant présent. ATTENTION : c'est le SEUL champ de cette structure qui ne soit PAS
   * borné au jour demandé — il est calculé sur tous les événements reçus. C'est voulu : sans lui,
   * un encadrant dont le shift a démarré la veille apparaîtrait comme absent aujourd'hui.
   */
  live: LiveStatus | null
  totalMinutes: number
  workedMinutes: number
  activeMinutes: number
  pauseMinutes: number
  idleMinutes: number
  pauses: ManagerSpan[]
  idles: ManagerSpan[]
  segments: Segment[]
  hasActivity: boolean
}

const span = (s: Segment): ManagerSpan => ({
  start: s.start,
  end: s.end,
  minutes: Math.round((s.end - s.start) / 60_000),
})

export function managerDay(
  events: TrackerEvent[],
  day: string,
  { now = Date.now(), staleMs = DEFAULT_STALE_MS }: { now?: number; staleMs?: number } = {},
): ManagerDay {
  const built = buildSegments(events, { now, staleMs })

  // Jour d'attribution d'un segment = jour Paris de son `shift_start`.
  const shiftDay = (s: Segment): string | null =>
    s.shiftStart != null ? parisDay(new Date(s.shiftStart).toISOString()) : null

  const segments = built.segments.filter((s) => shiftDay(s) === day).sort((a, b) => a.start - b.start)
  const of = (kind: Segment['kind']): Segment[] => segments.filter((s) => s.kind === kind)
  const mins = (list: Segment[]): number =>
    Math.round(list.reduce((t, s) => t + (s.end - s.start), 0) / 60_000)

  const pauses = of('pause')
  const idles = of('idle')
  const activeMinutes = mins(of('active'))
  const workedMinutes = activeMinutes + mins(idles) // le chrono du manager

  // Le shift ouvert / planté est-il celui de CE jour ? (dernier segment global)
  const lastGlobal = built.segments[built.segments.length - 1]
  const openHere = built.openShift && !!lastGlobal && shiftDay(lastGlobal) === day
  const crashedHere = built.crashed && !!lastGlobal && shiftDay(lastGlobal) === day
  const lastHere = segments[segments.length - 1]
  const recoveredHere = built.recovered && !!lastGlobal && shiftDay(lastGlobal) === day

  const first = segments[0]
  const started = first ? first.start : null
  const ended = openHere || crashedHere ? null : lastHere ? lastHere.end : null

  return {
    date: day,
    started,
    // Shift encore ouvert ou jamais clôturé : pas d'heure de fin fiable. On le dit au lieu d'en
    // inventer une.
    ended,
    openShift: openHere,
    crashed: crashedHere,
    recovered: recoveredHere,
    live: liveFromEvents(events, now, staleMs),
    totalMinutes:
      started != null && lastHere ? Math.round(((ended ?? lastHere.end) - started) / 60_000) : 0,
    workedMinutes,
    activeMinutes,
    pauseMinutes: mins(pauses),
    idleMinutes: mins(idles),
    pauses: pauses.map(span),
    idles: idles.map(span),
    segments,
    hasActivity: segments.length > 0,
  }
}

export interface ManagerCumul {
  days: number
  worked: number
  active: number
  pause: number
  idle: number
  total: number
}

/** Cumul sur une période : chaque shift compte une fois, rattaché à son jour de départ. */
export function sumManagerDays(days: ManagerDay[]): ManagerCumul {
  const acc: ManagerCumul = { days: 0, worked: 0, active: 0, pause: 0, idle: 0, total: 0 }
  for (const d of days) {
    if (!d.hasActivity) continue
    acc.days += 1
    acc.worked += d.workedMinutes
    acc.active += d.activeMinutes
    acc.pause += d.pauseMinutes
    acc.idle += d.idleMinutes
    acc.total += d.totalMinutes
  }
  return acc
}
