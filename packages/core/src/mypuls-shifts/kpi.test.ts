import { describe, expect, it } from 'vitest'
import { dayKpi } from './kpi'
import type { MypulsSegment } from './vacations'

const seg = (o: Partial<MypulsSegment> & { startTime: string; endTime: string }): MypulsSegment => ({
  mypulsUserId: 'A',
  day: '2026-08-31',
  endDay: '2026-08-31',
  activeMinutes: 60,
  messages: 100,
  models: [{ label: 'Taprofcarla', messages: 100 }],
  ...o,
})

const OPTS = { breakMinutes: 60, coverageThreshold: 80, modelsTotal: 18 }

describe('dayKpi', () => {
  it('compte personnes, temps et messages sur la COUVERTURE, pas sur les segments', () => {
    // Le tableau affiché sous les tuiles montre les lignes de couverture : les tuiles doivent
    // compter la même chose, sinon deux chiffres décrivent la même journée à l'écran.
    const k = dayKpi(
      [
        seg({ mypulsUserId: 'A', startTime: '05:00', endTime: '09:00', activeMinutes: 200, messages: 300 }),
        seg({
          mypulsUserId: 'B', startTime: '13:00', endTime: '17:00', activeMinutes: 180, messages: 250,
          models: [{ label: 'Claire_sps', messages: 250 }],
        }),
      ],
      [
        { slot: 'matin', mypulsUserId: 'A', coveragePct: 41.7, activeMinutes: 200, messages: 300 },
        { slot: 'aprem', mypulsUserId: 'B', coveragePct: 37.5, activeMinutes: 180, messages: 250 },
      ],
      OPTS,
    )
    expect(k.chattersActifs).toBe(2)
    expect(k.activeMinutes).toBe(380)
    expect(k.messages).toBe(550)
    // Les modèles, eux, restent lus sur les segments : la couverture ne les porte pas.
    expect(k.modelsWorked).toBe(2)
    expect(k.modelsTotal).toBe(18)
  })

  it('une nuit débordant sur le lendemain est comptée là où la couverture la place', () => {
    // Le segment démarre à 23:00 le jour civil précédent mais appartient au créneau du soir de
    // CE jour : c'est la couverture qui tranche, et la tuile la suit.
    const k = dayKpi(
      [seg({ mypulsUserId: 'A', day: '2026-08-30', startTime: '23:00', endTime: '04:00', endDay: '2026-08-31', activeMinutes: 300, messages: 400 })],
      [{ slot: 'soir', mypulsUserId: 'A', coveragePct: 62.5, activeMinutes: 300, messages: 400 }],
      OPTS,
    )
    expect(k.activeMinutes).toBe(300)
    expect(k.messages).toBe(400)
    expect(k.chattersActifs).toBe(1)
  })

  it('compte les vacations, pas les segments', () => {
    const k = dayKpi(
      [
        seg({ startTime: '05:00', endTime: '06:00' }),
        seg({ startTime: '06:10', endTime: '07:00' }), // même vacation (trou < 60)
        seg({ startTime: '13:00', endTime: '14:00' }), // nouvelle vacation
      ],
      [],
      OPTS,
    )
    expect(k.vacations).toBe(2)
  })

  it('un créneau est tenu dès qu’UNE personne atteint le seuil', () => {
    const k = dayKpi(
      [],
      [
        { slot: 'matin', mypulsUserId: 'A', coveragePct: 93.5, activeMinutes: 449, messages: 753 },
        { slot: 'matin', mypulsUserId: 'B', coveragePct: 12, activeMinutes: 58, messages: 40 },
        { slot: 'aprem', mypulsUserId: 'C', coveragePct: 40, activeMinutes: 192, messages: 300 },
      ],
      OPTS,
    )
    // Matin tenu, après-midi non, soirée sans aucune ligne : 1 sur 3.
    expect(k.slotsHeld).toBe(1)
    expect(k.slotsTotal).toBe(3)
  })

  it('une journée sans activité donne des zéros, pas une erreur', () => {
    const k = dayKpi([], [], OPTS)
    expect(k).toEqual({
      chattersActifs: 0,
      vacations: 0,
      activeMinutes: 0,
      messages: 0,
      modelsWorked: 0,
      modelsTotal: 18,
      slotsHeld: 0,
      slotsTotal: 3,
    })
  })
})
