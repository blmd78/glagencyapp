import { describe, expect, it } from 'vitest'
import { dueHabits, isDue, isMaterialized } from './occurrence'

const HABIT = { id: 'h1', label: 'Contrôler la nuit', category: 'Routine' }

describe('isMaterialized', () => {
  it('rien ce jour-là : l’occurrence reste virtuelle', () => {
    expect(isMaterialized(HABIT, [])).toBe(false)
  })

  it('reconnue à son habitude, même RENOMMÉE dans la pop-up (#160)', () => {
    expect(isMaterialized(HABIT, [{ habitId: 'h1', label: 'Autre titre', category: 'Routine' }])).toBe(true)
  })

  it('reconnue à son habitude, même déplacée dans une autre section du jour', () => {
    expect(isMaterialized(HABIT, [{ habitId: 'h1', label: HABIT.label, category: 'À faire' }])).toBe(true)
  })

  it('repli sur l’intitulé pour une ligne d’avant 0192 (habitId nul), dans la même section', () => {
    expect(isMaterialized(HABIT, [{ habitId: null, label: HABIT.label, category: 'Routine' }])).toBe(true)
  })

  it('le repli ne joue pas d’une section à l’autre (règle d’origine)', () => {
    expect(isMaterialized(HABIT, [{ habitId: null, label: HABIT.label, category: 'À faire' }])).toBe(false)
  })

  it('l’occurrence d’une AUTRE habitude au même intitulé ne la masque pas', () => {
    expect(isMaterialized(HABIT, [{ habitId: 'h2', label: HABIT.label, category: 'Routine' }])).toBe(false)
  })
})

describe('isDue — la date de début (0193, #163)', () => {
  const h = { active: true, weekdays: '1,2,3,4,5,6,7', starts_on: '2026-10-12' }

  it('pas avant sa date de début', () => expect(isDue(h, '2026-10-11')).toBe(false))
  it('dès sa date de début', () => expect(isDue(h, '2026-10-12')).toBe(true))
  it('sans date de début (habitudes d’avant 0193) : comme avant', () =>
    expect(isDue({ ...h, starts_on: null }, '2020-01-06')).toBe(true))
  it('en pause : jamais', () => expect(isDue({ ...h, active: false }, '2026-10-13')).toBe(false))
  it('jour de la semaine non coché : non', () => expect(isDue({ ...h, weekdays: '1' }, '2026-10-13')).toBe(false))
})

describe('dueHabits', () => {
  const habits = [
    { id: 'h0', label: 'Pause', category: 'Routine', weekdays: '1', active: false, starts_on: null },
    { id: 'h1', label: 'A', category: 'Routine', weekdays: '1', active: true, starts_on: null },
    { id: 'h2', label: 'B', category: 'Autre', weekdays: '1', active: true, starts_on: null },
  ]

  it('le rang vient de la liste COMPLÈTE : une habitude en pause ne fait pas bouger les autres', () => {
    expect(dueHabits(habits, '2026-10-12', 'Routine', []).map((x) => [x.habit.id, x.rank])).toEqual([['h1', 1]])
  })

  it('une occurrence déjà matérialisée n’est plus due', () => {
    expect(dueHabits(habits, '2026-10-12', 'Routine', [{ habitId: 'h1', label: 'A', category: 'Routine' }])).toEqual([])
  })
})
