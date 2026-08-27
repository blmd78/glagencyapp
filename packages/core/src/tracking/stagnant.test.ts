import { describe, expect, it } from 'vitest'
import { buildSegments } from './segments'
import { stagnantStretch } from './stagnant'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const at = (offsetMin: number): string => new Date(T0 + min(offsetMin)).toISOString()
const focus = (offsetMin: number): TrackerEvent => ({ type: 'focus', at: at(offsetMin), meta: { app: 'chrome' } })

describe('stagnantStretch', () => {
  it('trouve la plus longue plage active sans changement de fenêtre', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      focus(0), focus(5), focus(10),      // activité normale
      focus(100),                          // 90 min sans le moindre changement
      { type: 'shift_end', at: at(120) },
    ]
    const built = buildSegments(events, { now: T0 + min(200) })
    const s = stagnantStretch(built, events, T0, T0 + min(200))
    expect(s.tracked).toBe(true)
    expect(s.minutes).toBe(90)
    expect(s.from).toBe(T0 + min(10))
    expect(s.to).toBe(T0 + min(100))
  })

  it('moins de 2 changements : on ne signale RIEN (donnée absente ≠ faute)', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      focus(0),
      { type: 'shift_end', at: at(120) },
    ]
    const built = buildSegments(events, { now: T0 + min(200) })
    expect(stagnantStretch(built, events, T0, T0 + min(200))).toEqual({
      minutes: 0, from: null, to: null, tracked: false,
    })
  })

  it('aucun segment actif : rien à signaler', () => {
    const built = buildSegments([], { now: T0 })
    expect(stagnantStretch(built, [], T0, T0 + min(200)).tracked).toBe(false)
  })

  it('la pause coupe la plage : elle n\'est pas « active »', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      focus(0), focus(2),
      { type: 'pause', at: at(10) },
      { type: 'resume', at: at(70) },      // 60 min de pause, pas d'écran figé
      focus(75),
      { type: 'shift_end', at: at(80) },
    ]
    const built = buildSegments(events, { now: T0 + min(200) })
    const s = stagnantStretch(built, events, T0, T0 + min(200))
    expect(s.minutes).toBeLessThanOrEqual(10)
  })

  it('des `focus` pendant une PAUSE ne prouvent rien sur le temps actif', () => {
    // Avant correction, ces 2 focus ouvraient la porte et les 240 min du 1er segment actif —
    // dépourvu de toute donnée de fenêtre — étaient signalées « écran figé ».
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'pause', at: at(240) },
      focus(242), focus(245),
      { type: 'resume', at: at(250) },
      { type: 'shift_end', at: at(260) },
    ]
    const built = buildSegments(events, { now: T0 + min(400) })
    const s = stagnantStretch(built, events, T0, T0 + min(400))
    expect(s.tracked).toBe(false)
    expect(s.minutes).toBe(0)
  })

  it('la fenêtre d\'analyse BORNE le segment actif', () => {
    // Segment actif 0→200, changements à 60 et 70, analyse sur [50,150].
    // Sans bornage : 130 min (de 70 à 200). Avec : 80 min (de 70 à 150).
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      focus(60), focus(70),
      { type: 'shift_end', at: at(200) },
    ]
    const built = buildSegments(events, { now: T0 + min(400) })
    const s = stagnantStretch(built, events, T0 + min(50), T0 + min(150))
    expect(s.tracked).toBe(true)
    expect(s.minutes).toBe(80)
    expect(s.from).toBe(T0 + min(70))
    expect(s.to).toBe(T0 + min(150))
  })
})
