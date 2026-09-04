import { describe, expect, it } from 'vitest'
import {
  groupIntoVacations,
  groupVacationsAt,
  segmentBounds,
  type MypulsSegment,
} from './vacations'

const seg = (
  o: Partial<MypulsSegment> & { day: string; startTime: string; endTime: string },
): MypulsSegment => ({
  mypulsUserId: '2448',
  endDay: o.day,
  activeMinutes: 10,
  messages: 20,
  models: [{ label: 'Taprofcarla', messages: 20 }],
  ...o,
})

const iso = (ms: number): string => new Date(ms).toISOString()

describe('segmentBounds', () => {
  it('convertit l’heure murale Paris en instant UTC (heure d’été)', () => {
    const b = segmentBounds(seg({ day: '2026-08-29', startTime: '21:01', endTime: '23:30' }))
    expect(iso(b.startMs)).toBe('2026-08-29T19:01:00.000Z')
    expect(iso(b.endMs)).toBe('2026-08-29T21:30:00.000Z')
  })

  it('gère un segment qui franchit minuit via `endDay`', () => {
    const b = segmentBounds(
      seg({ day: '2026-08-29', startTime: '21:01', endTime: '05:38', endDay: '2026-08-30' }),
    )
    expect(iso(b.startMs)).toBe('2026-08-29T19:01:00.000Z')
    expect(iso(b.endMs)).toBe('2026-08-30T03:38:00.000Z')
  })

  it('la nuit du passage à l’heure d’hiver n’est pas décalée', () => {
    // 2026-10-25 : Paris repasse de UTC+2 à UTC+1 à 03:00 locales. Une addition naïve de
    // « heures × 3 600 000 » sur le début de journée décalerait la fin d'une heure entière —
    // donc la vacation entière de créneau, donc son verdict.
    const b = segmentBounds(
      seg({ day: '2026-10-24', startTime: '21:00', endTime: '05:00', endDay: '2026-10-25' }),
    )
    expect(iso(b.startMs)).toBe('2026-10-24T19:00:00.000Z') // 21:00 CEST
    expect(iso(b.endMs)).toBe('2026-10-25T04:00:00.000Z') // 05:00 CET
  })
})

describe('groupIntoVacations', () => {
  it('fusionne deux segments séparés par moins que le seuil', () => {
    const v = groupIntoVacations(
      [
        seg({ day: '2026-08-29', startTime: '09:00', endTime: '10:00', activeMinutes: 61, messages: 100 }),
        seg({ day: '2026-08-29', startTime: '10:30', endTime: '11:00', activeMinutes: 31, messages: 40 }),
      ],
      60,
    )
    expect(v).toHaveLength(1)
    expect(v[0]!.segments).toBe(2)
    expect(v[0]!.activeMinutes).toBe(92)
    expect(v[0]!.messages).toBe(140)
    expect(iso(v[0]!.startedAtMs)).toBe('2026-08-29T07:00:00.000Z')
    expect(iso(v[0]!.endedAtMs)).toBe('2026-08-29T09:00:00.000Z')
  })

  it('coupe dès que le trou atteint le seuil', () => {
    const v = groupIntoVacations(
      [
        seg({ day: '2026-08-29', startTime: '09:00', endTime: '10:00' }),
        seg({ day: '2026-08-29', startTime: '11:00', endTime: '12:00' }),
      ],
      60,
    )
    expect(v).toHaveLength(2)
  })

  it('le temps actif d’une vacation est la SOMME des segments, pas la durée bornes à bornes', () => {
    const v = groupIntoVacations(
      [
        seg({ day: '2026-08-29', startTime: '09:00', endTime: '09:10', activeMinutes: 11 }),
        seg({ day: '2026-08-29', startTime: '09:50', endTime: '10:00', activeMinutes: 11 }),
      ],
      60,
    )
    expect(v).toHaveLength(1)
    // Bornes à bornes = 60 min, mais 40 min de creux : le temps actif reste 22.
    expect(v[0]!.activeMinutes).toBe(22)
    expect(v[0]!.endedAtMs - v[0]!.startedAtMs).toBe(60 * 60_000)
  })

  it('sépare les personnes et remet les segments dans l’ordre', () => {
    const v = groupIntoVacations(
      [
        seg({ mypulsUserId: 'B', day: '2026-08-29', startTime: '14:00', endTime: '15:00' }),
        seg({ mypulsUserId: 'A', day: '2026-08-29', startTime: '10:00', endTime: '11:00' }),
        seg({ mypulsUserId: 'A', day: '2026-08-29', startTime: '09:00', endTime: '09:30' }),
      ],
      60,
    )
    expect(v).toHaveLength(2)
    expect(v[0]!.mypulsUserId).toBe('A')
    expect(v[0]!.segments).toBe(2)
    expect(iso(v[0]!.startedAtMs)).toBe('2026-08-29T07:00:00.000Z')
    expect(v[1]!.mypulsUserId).toBe('B')
  })

  it('fusionne les modèles et les trie du plus bavard au moins bavard', () => {
    const v = groupIntoVacations(
      [
        seg({
          day: '2026-08-29', startTime: '09:00', endTime: '10:00', messages: 50,
          models: [{ label: 'Claire_sps', messages: 30 }, { label: 'Manonbch', messages: 20 }],
        }),
        seg({
          day: '2026-08-29', startTime: '10:10', endTime: '11:00', messages: 40,
          models: [{ label: 'Manonbch', messages: 40 }],
        }),
      ],
      60,
    )
    expect(v[0]!.models).toEqual([
      { label: 'Manonbch', messages: 60 },
      { label: 'Claire_sps', messages: 30 },
    ])
  })

  it('une vacation de nuit garde le jour de DÉBUT', () => {
    const v = groupIntoVacations(
      [seg({ day: '2026-08-29', startTime: '21:01', endTime: '05:38', endDay: '2026-08-30' })],
      60,
    )
    expect(v[0]!.day).toBe('2026-08-29')
    expect(iso(v[0]!.endedAtMs)).toBe('2026-08-30T03:38:00.000Z')
  })

  it('la fin est la plus tardive, même si un segment plus court commence après', () => {
    // Cas réel du multi-modèles : deux segments qui se chevauchent.
    const v = groupIntoVacations(
      [
        seg({ day: '2026-08-29', startTime: '09:00', endTime: '12:00' }),
        seg({ day: '2026-08-29', startTime: '09:30', endTime: '10:00' }),
      ],
      60,
    )
    expect(v).toHaveLength(1)
    expect(iso(v[0]!.endedAtMs)).toBe('2026-08-29T10:00:00.000Z') // 12:00 Paris
  })

  it('rend une liste vide sur une entrée vide', () => {
    expect(groupIntoVacations([], 60)).toEqual([])
  })
})

describe('groupVacationsAt', () => {
  it('donne le même résultat que la version en heure murale', () => {
    const segs = [
      seg({ day: '2026-08-29', startTime: '09:00', endTime: '10:00', activeMinutes: 61, messages: 100 }),
      seg({ day: '2026-08-29', startTime: '10:30', endTime: '11:00', activeMinutes: 31, messages: 40 }),
    ]
    const mural = groupIntoVacations(segs, 60)
    const instants = groupVacationsAt(
      segs.map((s) => {
        const b = segmentBounds(s)
        return {
          mypulsUserId: s.mypulsUserId,
          day: s.day,
          startedAtMs: b.startMs,
          endedAtMs: b.endMs,
          activeMinutes: s.activeMinutes,
          messages: s.messages,
          models: s.models,
        }
      }),
      60,
    )
    expect(instants).toEqual(mural)
  })

  it('ne repasse PAS par l’heure murale : l’heure répétée du 25 octobre reste distincte', () => {
    // 2026-10-25, Paris revient à UTC+1 à 03:00 locales. 02:30 existe DEUX fois. En heure
    // murale les deux instants se confondent ; en instants ils restent deux segments.
    const t1 = Date.parse('2026-10-25T00:30:00Z') // 02:30 CEST
    const t2 = Date.parse('2026-10-25T01:30:00Z') // 02:30 CET
    const v = groupVacationsAt(
      [
        { mypulsUserId: 'A', day: '2026-10-25', startedAtMs: t1, endedAtMs: t1 + 600_000, activeMinutes: 10, messages: 5, models: [] },
        { mypulsUserId: 'A', day: '2026-10-25', startedAtMs: t2, endedAtMs: t2 + 600_000, activeMinutes: 10, messages: 5, models: [] },
      ],
      60,
    )
    expect(v).toHaveLength(1)
    expect(v[0]!.segments).toBe(2)
    expect(v[0]!.activeMinutes).toBe(20)
    expect(new Date(v[0]!.endedAtMs).toISOString()).toBe('2026-10-25T01:40:00.000Z')
  })
})
