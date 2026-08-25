import { describe, expect, it } from 'vitest'
import { DEFAULT_STALE_MS, buildSegments, liveFromEvents, summarize } from './segments'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z') // 09h00 Paris
const min = (n: number): number => n * 60_000
const ev = (type: TrackerEvent['type'], offsetMin: number, extra: Partial<TrackerEvent> = {}): TrackerEvent => ({
  type,
  at: new Date(T0 + min(offsetMin)).toISOString(),
  receivedAt: new Date(T0 + min(offsetMin)).toISOString(),
  sessionId: 's1',
  ...extra,
})

describe('buildSegments', () => {
  it('un shift simple : actif du début à la fin', () => {
    const b = buildSegments([ev('shift_start', 0), ev('shift_end', 60)], { now: T0 + min(120) })
    expect(b.segments).toHaveLength(1)
    expect(b.segments[0]).toMatchObject({ kind: 'active', start: T0, end: T0 + min(60) })
    expect(b.openShift).toBe(false)
    expect(b.crashed).toBe(false)
    expect(b.firstStart).toBe(T0)
    expect(b.lastStop).toBe(T0 + min(60))
  })

  it('pause puis reprise : trois segments', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('pause', 20), ev('resume', 30), ev('shift_end', 60)],
      { now: T0 + min(120) },
    )
    expect(b.segments.map((s) => s.kind)).toEqual(['active', 'pause', 'active'])
    expect(b.segments[1]).toMatchObject({ start: T0 + min(20), end: T0 + min(30) })
  })

  it('inactivité : le temps idle ne compte pas comme actif', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('idle_start', 10), ev('idle_end', 25), ev('shift_end', 40)],
      { now: T0 + min(120) },
    )
    expect(b.segments.map((s) => s.kind)).toEqual(['active', 'idle', 'active'])
  })

  it('horloge qui remonte : l’événement est ramené à l’instant précédent', () => {
    const events: TrackerEvent[] = [
      ev('shift_start', 0),
      { ...ev('pause', 0), at: new Date(T0 - min(30)).toISOString() },
      ev('shift_end', 60),
    ]
    const b = buildSegments(events, { now: T0 + min(120) })
    // Sans le clamp, la pause démarrerait 30 min AVANT le shift.
    expect(b.segments).toHaveLength(1)
    expect(b.segments[0]).toMatchObject({ kind: 'pause', start: T0, end: T0 + min(60) })
  })

  it('shift jamais clos et plus aucun battement : crashed, coupé au dernier battement', () => {
    const b = buildSegments([ev('shift_start', 0), ev('heartbeat', 30)], { now: T0 + min(120) })
    expect(b.crashed).toBe(true)
    expect(b.openShift).toBe(false)
    expect(b.segments[0]?.end).toBe(T0 + min(30))
  })

  it('shift qui bat encore : ouvert, couru jusqu’à maintenant', () => {
    const now = T0 + min(40)
    const b = buildSegments([ev('shift_start', 0), ev('heartbeat', 39)], { now })
    expect(b.openShift).toBe(true)
    expect(b.crashed).toBe(false)
    expect(b.segments[0]?.end).toBe(now)
  })

  it('shift_end marqué `recovered` : clôture propre mais anormale', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('shift_end', 60, { meta: { recovered: true } })],
      { now: T0 + min(120) },
    )
    expect(b.recovered).toBe(true)
    expect(b.crashed).toBe(false)
  })

  it('shift précédent jamais fermé : un nouveau shift_start le clôt', () => {
    const b = buildSegments([ev('shift_start', 0), ev('shift_start', 30), ev('shift_end', 60)], {
      now: T0 + min(120),
    })
    expect(b.segments).toHaveLength(2)
    expect(b.segments[1]?.shiftStart).toBe(T0 + min(30))
  })

  it('DEFAULT_STALE_MS vaut 3 minutes', () => {
    expect(DEFAULT_STALE_MS).toBe(180_000)
  })
})

describe('liveFromEvents', () => {
  it('se fie à receivedAt, pas à l’horloge du poste', () => {
    // `at` délirant DANS LE PASSÉ, au-delà du seuil : une implémentation qui lirait `at` au lieu
    // de `receivedAt` conclurait « hors ligne ». Avec `at` dans le futur, les deux implémentations
    // répondraient « en ligne » et le test ne prouverait rien.
    const now = T0 + min(1)
    const events: TrackerEvent[] = [
      { ...ev('shift_start', 0), at: new Date(T0 - min(9999)).toISOString() },
    ]
    expect(liveFromEvents(events, now)).toMatchObject({ state: 'active' })
  })
  it('rien reçu depuis staleMs → hors ligne', () => {
    expect(liveFromEvents([ev('shift_start', 0)], T0 + min(10))).toBeNull()
  })
  it('shift clos → hors ligne', () => {
    expect(liveFromEvents([ev('shift_start', 0), ev('shift_end', 1)], T0 + min(2))).toBeNull()
  })
  it('suit pause et inactivité', () => {
    expect(liveFromEvents([ev('shift_start', 0), ev('pause', 1)], T0 + min(2))?.state).toBe('pause')
    expect(liveFromEvents([ev('shift_start', 0), ev('idle_start', 1)], T0 + min(2))?.state).toBe('idle')
  })
})

describe('summarize', () => {
  it('agrège sur la fenêtre et compte les coupures', () => {
    const b = buildSegments(
      [ev('shift_start', 0), ev('pause', 20), ev('resume', 30), ev('idle_start', 40), ev('idle_end', 50), ev('shift_end', 60)],
      { now: T0 + min(120) },
    )
    const s = summarize(b, T0 - min(60), T0 + min(180))
    expect(s.activeMinutes).toBe(40)
    expect(s.pauseMinutes).toBe(10)
    expect(s.idleMinutes).toBe(10)
    expect(s.pauseCount).toBe(1)
    expect(s.idleCuts).toBe(1)
    expect(s.launched).toBe(true)
    expect(s.hasActivity).toBe(true)
  })
  it('hors fenêtre : firstStart et lastStop sont nuls', () => {
    const b = buildSegments([ev('shift_start', 0), ev('shift_end', 60)], { now: T0 + min(120) })
    const s = summarize(b, T0 + min(600), T0 + min(700))
    expect(s.firstStart).toBeNull()
    expect(s.lastStop).toBeNull()
    expect(s.activeMinutes).toBe(0)
  })
})
