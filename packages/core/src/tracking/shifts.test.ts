import { describe, expect, it } from 'vitest'
import { SHIFTS, currentShift, shiftByKey, shiftWindow } from './shifts'

const at = (iso: string): number => Date.parse(iso)

describe('SHIFTS', () => {
  it('trois shifts de 8 h couvrant 24 h', () => {
    expect(SHIFTS.map((s) => s.key)).toEqual(['matin', 'aprem', 'nuit'])
    expect(shiftByKey('nuit')?.startH).toBe(21)
    expect(shiftByKey('inconnu')).toBeUndefined()
  })
})

describe('shiftWindow', () => {
  it('matin, appelé juste après la fin : la fenêtre est celle du jour même', () => {
    // 13h05 Paris le 25/08 (= 11:05Z) → matin = 05h→13h Paris le 25
    const w = shiftWindow(shiftByKey('matin')!, at('2026-08-25T11:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-08-25T03:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-08-25T11:00:00.000Z')
    expect(w.date).toBe('2026-08-25')
    expect(w.range).toBe('05h → 13h')
  })
  it('nuit, appelé à 05h05 : la fenêtre part de la VEILLE 21 h', () => {
    // 05h05 Paris le 25/08 (= 03:05Z) → nuit = 21h le 24 → 05h le 25
    const w = shiftWindow(shiftByKey('nuit')!, at('2026-08-25T03:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-08-24T19:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-08-25T03:00:00.000Z')
    expect(w.date).toBe('2026-08-25')
  })
  it('si la fin est postérieure à maintenant, on recule d\'un jour', () => {
    // 09h00 Paris le 25/08 : l'après-midi (fin 21 h) ne s'est pas encore terminé aujourd'hui
    // → c'est celui d'HIER qui vient de finir.
    const w = shiftWindow(shiftByKey('aprem')!, at('2026-08-25T07:00:00Z'))
    expect(w.date).toBe('2026-08-24')
    expect(new Date(w.end).toISOString()).toBe('2026-08-24T19:00:00.000Z')
  })
})

describe('currentShift', () => {
  it('découpe la journée Paris en trois', () => {
    expect(currentShift(at('2026-08-25T05:00:00Z')).key).toBe('matin')  // 07h Paris
    expect(currentShift(at('2026-08-25T13:00:00Z')).key).toBe('aprem')  // 15h Paris
    expect(currentShift(at('2026-08-25T21:00:00Z')).key).toBe('nuit')   // 23h Paris
    expect(currentShift(at('2026-08-25T01:00:00Z')).key).toBe('nuit')   // 03h Paris
  })
})
