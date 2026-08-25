import { describe, expect, it } from 'vitest'
import { managerDay, sumManagerDays } from './manager-day'
import type { TrackerEvent } from './types'

const min = (n: number): number => n * 60_000
// 2026-08-16 22h00 Paris = 20:00Z
const NIGHT = Date.parse('2026-08-16T20:00:00Z')
const at = (base: number, offsetMin: number): string => new Date(base + min(offsetMin)).toISOString()

describe('managerDay', () => {
  it('un shift de nuit est rattaché EN ENTIER à son jour de départ', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },        // 16/08 22h00 Paris
      { type: 'shift_end', at: at(NIGHT, 360) },        // 17/08 04h00 Paris
    ]
    const d16 = managerDay(events, '2026-08-16', { now: NIGHT + min(600) })
    expect(d16.hasActivity).toBe(true)
    expect(d16.workedMinutes).toBe(360)

    const d17 = managerDay(events, '2026-08-17', { now: NIGHT + min(600) })
    expect(d17.hasActivity).toBe(false)
    expect(d17.workedMinutes).toBe(0)
  })

  it('workedMinutes = actif + inactif (le chrono du manager), pauses déduites', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'pause', at: at(NIGHT, 60) },
      { type: 'resume', at: at(NIGHT, 90) },            // 30 min de pause
      { type: 'idle_start', at: at(NIGHT, 120) },
      { type: 'idle_end', at: at(NIGHT, 140) },         // 20 min d'inactivité
      { type: 'shift_end', at: at(NIGHT, 200) },
    ]
    const d = managerDay(events, '2026-08-16', { now: NIGHT + min(600) })
    expect(d.pauseMinutes).toBe(30)
    expect(d.idleMinutes).toBe(20)
    expect(d.activeMinutes).toBe(150)                   // 200 − 30 − 20
    expect(d.workedMinutes).toBe(170)                   // actif + inactif
    expect(d.totalMinutes).toBe(200)                    // du début à la fin
  })

  it('shift ouvert : pas d’heure de fin inventée', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'heartbeat', at: at(NIGHT, 59) },
    ]
    const d = managerDay(events, '2026-08-16', { now: NIGHT + min(60) })
    expect(d.openShift).toBe(true)
    expect(d.ended).toBeNull()
  })

  it('aucune activité ce jour-là', () => {
    const d = managerDay([], '2026-08-16', { now: NIGHT })
    expect(d.hasActivity).toBe(false)
    expect(d.started).toBeNull()
    expect(d.workedMinutes).toBe(0)
  })

  it('shift de la veille jamais clôturé : aujourd’hui est vide, mais `live` reste actif', () => {
    const now = NIGHT + min(720)
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'heartbeat', at: at(NIGHT, 719) },
    ]
    const hier = managerDay(events, '2026-08-16', { now })
    expect(hier.openShift).toBe(true)
    expect(hier.ended).toBeNull()
    expect(hier.live).toMatchObject({ state: 'active' })

    const aujourdhui = managerDay(events, '2026-08-17', { now })
    expect(aujourdhui.hasActivity).toBe(false)
    expect(aujourdhui.workedMinutes).toBe(0)
    // `live` est le SEUL champ qui ne soit pas borné au jour demandé : c'est lui qui évite
    // d'afficher comme absent un encadrant réellement au travail.
    expect(aujourdhui.live).toMatchObject({ state: 'active' })
  })

  it('PC éteint en pleine session : `crashed`, sans heure de fin inventée', () => {
    const now = NIGHT + min(200)
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'heartbeat', at: at(NIGHT, 60) },
    ]
    const d = managerDay(events, '2026-08-16', { now })
    expect(d.crashed).toBe(true)
    expect(d.openShift).toBe(false)
    expect(d.ended).toBeNull()
    expect(d.workedMinutes).toBe(60)
  })

  it('deux shifts le même jour : `totalMinutes` couvre le trou, pas `workedMinutes`', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: '2026-08-17T06:00:00.000Z' },   // 08h Paris
      { type: 'shift_end', at: '2026-08-17T10:00:00.000Z' },     // 12h Paris
      { type: 'shift_start', at: '2026-08-17T14:00:00.000Z' },   // 16h Paris
      { type: 'shift_end', at: '2026-08-17T18:00:00.000Z' },     // 20h Paris
    ]
    const d = managerDay(events, '2026-08-17', { now: Date.parse('2026-08-17T20:00:00.000Z') })
    expect(d.activeMinutes).toBe(480)
    expect(d.workedMinutes).toBe(480)
    // Le trou de 4 h est DANS `totalMinutes` (début → fin) mais hors du temps travaillé.
    expect(d.totalMinutes).toBe(720)
  })
})

describe('sumManagerDays', () => {
  it('ne compte que les jours avec activité', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(NIGHT, 0) },
      { type: 'shift_end', at: at(NIGHT, 120) },
    ]
    const days = [
      managerDay(events, '2026-08-16', { now: NIGHT + min(600) }),
      managerDay([], '2026-08-17', { now: NIGHT + min(600) }),
    ]
    const c = sumManagerDays(days)
    expect(c.days).toBe(1)
    expect(c.worked).toBe(120)
  })
})
