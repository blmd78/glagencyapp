import type { BuiltSegments, LiveState, LiveStatus, Segment, SegmentKind, TrackerEvent } from './types'

/** Un shift sans battement pendant 3 min est considéré coupé (STALE_MINUTES=3 en production). */
export const DEFAULT_STALE_MS = 3 * 60_000

type State = SegmentKind | 'off'

/**
 * Rejoue le flux d'événements et en déduit des segments typés.
 *
 * L'agent horodate `idle_start` au DÉBUT RÉEL de l'inactivité (now − idleSeconds) : les minutes de
 * battement ne sont donc jamais comptées comme du temps actif.
 *
 * ⚠️ CONTRAT D'ENTRÉE, deux préconditions que cette fonction ne peut pas vérifier :
 *
 * 1. Les événements doivent être TRIÉS par `at` croissant. La normalisation d'horloge ramène tout
 *    événement à l'instant du précédent : un `pause` livré en retard (reprise réseau) serait donc
 *    daté du dernier événement vu, et gonflerait la pause d'autant.
 * 2. Les `heartbeat` ne sont PAS stockés en base (le `check` de `tracker_events` les exclut). La
 *    couche service DOIT donc synthétiser un `heartbeat` final depuis `tracker_live.last_heartbeat_at`
 *    avant d'appeler cette fonction — sans lui, tout shift EN COURS est vu comme planté et rendu
 *    à zéro minute.
 */
export function buildSegments(
  events: TrackerEvent[],
  { now = Date.now(), staleMs = DEFAULT_STALE_MS }: { now?: number; staleMs?: number } = {},
): BuiltSegments {
  const segments: Segment[] = []
  let state: State = 'off'
  let segStart: number | null = null
  let lastTs = -Infinity
  let lastHeartbeat: number | null = null
  let firstStart: number | null = null
  let lastStop: number | null = null
  const sessions = new Set<string>()
  let curShiftStart: number | null = null
  let lastCloseRecovered = false

  const close = (end: number): void => {
    if (state !== 'off' && segStart != null && end > segStart) {
      segments.push({ kind: state, start: segStart, end, shiftStart: curShiftStart })
    }
  }
  const to = (next: State, t: number): State => {
    close(t)   // close() lit l'ANCIEN état — c'est voulu, ne pas déplacer
    segStart = next === 'off' ? null : t
    return next
  }

  for (const e of events) {
    // Horloge monotone : un événement ne peut pas remonter avant le précédent.
    const t = Math.max(Date.parse(e.at), lastTs)
    if (!Number.isFinite(t)) continue
    lastTs = t
    if (e.sessionId) sessions.add(e.sessionId)

    switch (e.type) {
      case 'shift_start':
        if (state !== 'off') state = to('off', t) // shift précédent jamais fermé
        curShiftStart = t
        state = to('active', t)
        lastHeartbeat = t
        if (firstStart == null) firstStart = t
        break
      case 'pause':
        if (state !== 'off') state = to('pause', t)
        break
      case 'resume':
        if (state !== 'off') state = to('active', t)
        break
      case 'idle_start':
        if (state === 'active') state = to('idle', t)
        break
      case 'idle_end':
        if (state === 'idle') state = to('active', t)
        break
      case 'shift_end':
        if (state !== 'off') {
          state = to('off', t)
          lastStop = t
          lastCloseRecovered = e.meta?.recovered === true
        }
        break
      case 'heartbeat':
        if (state !== 'off') lastHeartbeat = t
        break
      default:
        break // `focus` et `model` ne changent pas d'état
    }
  }

  // Shift encore ouvert : soit il tourne vraiment, soit l'app/le PC a planté.
  let crashed = false
  if (state !== 'off' && segStart != null) {
    const deadline = (lastHeartbeat ?? segStart) + staleMs
    if (deadline < now) {
      crashed = true
      close(Math.max(segStart, lastHeartbeat ?? segStart))
    } else {
      close(now)
    }
    if (crashed && lastStop == null) lastStop = lastHeartbeat
  }

  return {
    segments,
    firstStart,
    lastStop,
    crashed,
    recovered: lastCloseRecovered && !crashed,
    openShift: state !== 'off' && !crashed,
    eventCount: events.length,
    sessions: [...sessions],
  }
}

/**
 * État « en direct », calculé sur l'heure de RÉCEPTION serveur et non sur l'horloge du poste.
 * Un PC à l'heure fausse ne disparaît donc pas de « en ligne ».
 * `null` = hors ligne (rien reçu depuis `staleMs`) ou shift fermé.
 */
export function liveFromEvents(
  events: TrackerEvent[],
  now: number = Date.now(),
  staleMs: number = DEFAULT_STALE_MS,
): LiveStatus | null {
  let lastSeen = 0
  let state: LiveState | 'off' = 'off'
  let since: number | null = null

  for (const e of events) {
    // `receivedAt` SEUL, jamais `at` : c'est la raison d'être de cette fonction. Un poste dont
    // l'horloge est en avance se déclarerait « en ligne » pour toujours si on se fiait à `at`.
    const recv = Date.parse(e.receivedAt ?? '')
    if (Number.isFinite(recv) && recv > lastSeen) lastSeen = recv
    switch (e.type) {
      case 'shift_start': state = 'active'; since = recv; break
      case 'shift_end': state = 'off'; since = null; break
      case 'pause': if (state !== 'off') { state = 'pause'; since = recv } break
      case 'resume': if (state !== 'off') { state = 'active'; since = recv } break
      case 'idle_start': if (state !== 'off') { state = 'idle'; since = recv } break
      case 'idle_end': if (state !== 'off') { state = 'active'; since = recv } break
      default: break
    }
  }

  if (state === 'off') return null
  if (!lastSeen || now - lastSeen > staleMs) return null // app fermée / PC éteint
  return { state, since: Number.isFinite(since) && since != null ? since : lastSeen }
}

export interface DaySummary {
  activeMinutes: number
  pauseMinutes: number
  idleMinutes: number
  pauseCount: number
  idleCuts: number
  firstStart: number | null
  lastStop: number | null
  crashed: boolean
  recovered: boolean
  openShift: boolean
  launched: boolean
  hasActivity: boolean
}

const overlap = (s: Segment, a: number, b: number): number =>
  Math.max(0, Math.min(s.end, b) - Math.max(s.start, a))

/** Agrège les segments sur la fenêtre [dayStart, dayEnd). */
export function summarize(built: BuiltSegments, dayStart: number, dayEnd: number): DaySummary {
  const ms: Record<SegmentKind, number> = { active: 0, pause: 0, idle: 0 }
  for (const s of built.segments) ms[s.kind] += overlap(s, dayStart, dayEnd)

  const inDay = (t: number | null): boolean => t != null && t >= dayStart && t < dayEnd
  const countIn = (kind: SegmentKind): number =>
    built.segments.filter((s) => s.kind === kind && overlap(s, dayStart, dayEnd) > 0).length

  return {
    activeMinutes: Math.round(ms.active / 60_000),
    pauseMinutes: Math.round(ms.pause / 60_000),
    idleMinutes: Math.round(ms.idle / 60_000),
    pauseCount: countIn('pause'),
    idleCuts: countIn('idle'),
    firstStart: inDay(built.firstStart) ? built.firstStart : null,
    lastStop: inDay(built.lastStop) ? built.lastStop : null,
    // « app fermée » n'est vrai QUE si l'arrêt tombe dans la fenêtre : sinon on afficherait le
    // drapeau sans l'heure (« à — »). Cohérent avec lastStop.
    crashed: built.crashed && inDay(built.lastStop),
    recovered: built.recovered && inDay(built.lastStop),
    openShift: built.openShift,
    launched: built.eventCount > 0,
    hasActivity: ms.active + ms.pause + ms.idle > 0,
  }
}
