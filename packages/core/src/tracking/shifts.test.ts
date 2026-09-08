import { describe, expect, it } from 'vitest'
import { SHIFTS, currentShift, serviceDayParis, shiftByKey, shiftWindow, shiftWindowOn } from './shifts'

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
  it('nuit de bascule printemps : le shift dure 7 h réelles, pas 8', () => {
    // 05h05 Paris le 29/03 (= 03:05Z). La nuit part de 21h le 28 (UTC+1) et finit à 05h le 29
    // (UTC+2) : 7 h d'horloge. Un `end - 8h` rendrait 20:00Z, soit 20h Paris.
    const w = shiftWindow(shiftByKey('nuit')!, Date.parse('2026-03-29T03:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-03-28T20:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-03-29T03:00:00.000Z')
  })
  it('nuit de bascule automne : le shift dure 9 h réelles', () => {
    // 05h05 Paris le 25/10 (= 04:05Z). Départ 21h le 24 (UTC+2), fin 05h le 25 (UTC+1) : 9 h.
    const w = shiftWindow(shiftByKey('nuit')!, Date.parse('2026-10-25T04:05:00Z'))
    expect(new Date(w.start).toISOString()).toBe('2026-10-24T19:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-10-25T04:00:00.000Z')
  })
})

describe('currentShift', () => {
  it('découpe la journée Paris en trois', () => {
    expect(currentShift(at('2026-08-25T05:00:00Z')).key).toBe('matin')  // 07h Paris
    expect(currentShift(at('2026-08-25T13:00:00Z')).key).toBe('aprem')  // 15h Paris
    expect(currentShift(at('2026-08-25T21:00:00Z')).key).toBe('nuit')   // 23h Paris
    expect(currentShift(at('2026-08-25T01:00:00Z')).key).toBe('nuit')   // 03h Paris
  })
  it('les bornes exactes appartiennent au shift qui COMMENCE', () => {
    expect(currentShift(Date.parse('2026-08-25T03:00:00Z')).key).toBe('matin')  // 05h00 pile
    expect(currentShift(Date.parse('2026-08-25T11:00:00Z')).key).toBe('aprem')  // 13h00 pile
    expect(currentShift(Date.parse('2026-08-25T19:00:00Z')).key).toBe('nuit')   // 21h00 pile
  })
})

describe('shiftWindowOn', () => {
  it('rend la fenêtre du jour demandé, pas celle de maintenant', () => {
    const w = shiftWindowOn(shiftByKey('aprem')!, '2026-08-20')
    expect(new Date(w.start).toISOString()).toBe('2026-08-20T11:00:00.000Z') // 13h Paris
    expect(new Date(w.end).toISOString()).toBe('2026-08-20T19:00:00.000Z')   // 21h Paris
    expect(w.date).toBe('2026-08-20')
  })
  it('un shift de nuit démarre la VEILLE de sa date', () => {
    const w = shiftWindowOn(shiftByKey('nuit')!, '2026-08-20')
    expect(new Date(w.start).toISOString()).toBe('2026-08-19T19:00:00.000Z') // 21h le 19
    expect(new Date(w.end).toISOString()).toBe('2026-08-20T03:00:00.000Z')   // 05h le 20
  })
  it('nuit de bascule printemps : 7 h réelles, comme shiftWindow', () => {
    const w = shiftWindowOn(shiftByKey('nuit')!, '2026-03-29')
    expect(new Date(w.start).toISOString()).toBe('2026-03-28T20:00:00.000Z')
    expect(new Date(w.end).toISOString()).toBe('2026-03-29T03:00:00.000Z')
  })
  it('shiftWindow délègue : même résultat pour la date qu’il déduit', () => {
    const now = Date.parse('2026-08-26T14:05:00Z')
    const a = shiftWindow(shiftByKey('aprem')!, now)
    expect(shiftWindowOn(shiftByKey('aprem')!, a.date)).toEqual(a)
  })
})

describe('serviceDayParis — la journée de service, qui ne finit pas à minuit', () => {
  // Le service de nuit court jusqu'à 05:00 (SHIFTS.nuit.endH). Tant qu'il n'est pas fini, la
  // journée de travail en cours est celle de la VEILLE civile — c'est ce que l'encadrant vient
  // de faire, et ce qu'il débriefe.
  it('avant 05:00, rend la veille', () => {
    // 02:52 Paris (UTC+2 en septembre) — le cas réel remonté le 2026-09-08.
    expect(serviceDayParis(new Date('2026-09-08T00:52:00Z'))).toBe('2026-09-07')
    // 04:59:59 Paris, la dernière minute du service de nuit.
    expect(serviceDayParis(new Date('2026-09-08T02:59:59Z'))).toBe('2026-09-07')
  })

  it('à partir de 05:00, rend le jour civil', () => {
    expect(serviceDayParis(new Date('2026-09-08T03:00:00Z'))).toBe('2026-09-08')
    expect(serviceDayParis(new Date('2026-09-08T21:30:00Z'))).toBe('2026-09-08')
  })

  it('suit l’heure de PARIS, pas UTC — en hiver comme en été', () => {
    // 04:30 Paris en décembre (UTC+1) → encore la veille.
    expect(serviceDayParis(new Date('2026-12-01T03:30:00Z'))).toBe('2026-11-30')
    // 05:30 Paris en décembre → le jour civil.
    expect(serviceDayParis(new Date('2026-12-01T04:30:00Z'))).toBe('2026-12-01')
    // 23:30 UTC en septembre = 01:30 Paris le LENDEMAIN civil, donc journée du jour même.
    expect(serviceDayParis(new Date('2026-09-08T23:30:00Z'))).toBe('2026-09-08')
  })
})
