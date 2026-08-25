import { describe, expect, it } from 'vitest'
import { OVERLAP_ALERT_MINUTES, machineBreakdown } from './devices'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const NOW = T0 + min(500)
const ev = (type: TrackerEvent['type'], offsetMin: number, machineId: string | null): TrackerEvent => ({
  type,
  at: new Date(T0 + min(offsetMin)).toISOString(),
  machineId,
})

describe('machineBreakdown', () => {
  it('un seul poste : pas de multi, pas de chevauchement', () => {
    const events = [ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A')]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.machines).toHaveLength(1)
    expect(r.machines[0]).toMatchObject({ id: 'A', label: 'Poste 1', minutes: 60 })
    expect(r.multi).toBe(false)
    expect(r.overlapMinutes).toBe(0)
    expect(r.unionMinutes).toBe(60)
  })

  it('deux postes successifs : bascule signalée, pas de chevauchement', () => {
    const events = [
      ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A'),
      ev('shift_start', 70, 'B'), ev('shift_end', 130, 'B'),
    ]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.multi).toBe(true)
    expect(r.overlapMinutes).toBe(0)
    expect(r.unionMinutes).toBe(120)
    expect(r.switches).toHaveLength(1)
    expect(r.switches[0]).toMatchObject({ from: 'Poste 1', to: 'Poste 2' })
  })

  it('deux postes SIMULTANÉS : le chevauchement est compté, l’union corrige le total', () => {
    const events = [
      ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A'),
      ev('shift_start', 30, 'B'), ev('shift_end', 90, 'B'),
    ]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.multi).toBe(true)
    expect(r.overlapMinutes).toBe(30)          // 30→60
    expect(r.unionMinutes).toBe(90)            // et non 120 : le temps commun ne compte qu'une fois
  })

  it('fenêtre qui COUPE : `clip` borne chaque poste avant tout calcul', () => {
    // Sans clipping : 60/60, chevauchement 30, union 90 — comme sur la fenêtre pleine.
    const events = [
      ev('shift_start', 0, 'A'), ev('shift_end', 60, 'A'),
      ev('shift_start', 30, 'B'), ev('shift_end', 90, 'B'),
    ]
    const r = machineBreakdown(events, T0 + min(20), T0 + min(70), NOW)
    expect(r.machines.map((m) => m.minutes)).toEqual([40, 40])   // A [20,60], B [30,70]
    expect(r.overlapMinutes).toBe(30)                             // [30,60] inchangé
    expect(r.unionMinutes).toBe(50)                               // [20,70]
  })

  it('postes sans identifiant : historique d’avant la 1.0.3, on ne signale rien', () => {
    const events = [ev('shift_start', 0, null), ev('shift_end', 60, null)]
    const r = machineBreakdown(events, T0, T0 + min(300), NOW)
    expect(r.multi).toBe(false)
  })

  it('le seuil d’alerte est de 10 minutes', () => {
    expect(OVERLAP_ALERT_MINUTES).toBe(10)
  })
})
