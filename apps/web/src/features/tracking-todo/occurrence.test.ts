import { describe, expect, it } from 'vitest'
import { dueHabits, isDue, isMaterialized, isSectionOn, type OccurrenceRow } from './occurrence'

const HABIT = { id: 'h1', label: 'Contrôler la nuit', category: 'Routine' }
const D = '2026-10-12'
const row = (r: Partial<OccurrenceRow>): OccurrenceRow => ({
  habitId: null,
  habitDate: null,
  date: D,
  label: HABIT.label,
  category: HABIT.category,
  ...r,
})

describe('isMaterialized', () => {
  it('rien ce jour-là : l’occurrence reste virtuelle', () => {
    expect(isMaterialized(HABIT, D, [])).toBe(false)
  })

  it('reconnue à son habitude et son jour, même RENOMMÉE dans la pop-up (#160)', () => {
    expect(isMaterialized(HABIT, D, [row({ habitId: 'h1', habitDate: D, label: 'Autre titre' })])).toBe(true)
  })

  it('reconnue à son habitude, même déplacée dans une autre section du jour', () => {
    expect(isMaterialized(HABIT, D, [row({ habitId: 'h1', habitDate: D, category: 'À faire' })])).toBe(true)
  })

  it('CHANGÉE DE JOUR : elle reste l’occurrence de son jour d’origine…', () => {
    expect(isMaterialized(HABIT, D, [row({ habitId: 'h1', habitDate: D, date: '2026-10-13' })])).toBe(true)
  })

  it('… et ne masque pas l’occurrence due du jour d’arrivée', () => {
    expect(isMaterialized(HABIT, '2026-10-13', [row({ habitId: 'h1', habitDate: D, date: '2026-10-13' })])).toBe(false)
  })

  it('repli sur l’intitulé pour une ligne d’avant 0193 (habitId nul), même section, même jour', () => {
    expect(isMaterialized(HABIT, D, [row({})])).toBe(true)
  })

  it('le repli ne joue pas d’une section à l’autre (règle d’origine)', () => {
    expect(isMaterialized(HABIT, D, [row({ category: 'À faire' })])).toBe(false)
  })

  it('une occurrence SAUTÉE (« Juste aujourd’hui », #170) garde sa ligne : l’habitude ne renaît pas', () => {
    // La ligne sautée n'est pas affichée (get-week la filtre), mais elle est passée ici comme les
    // autres : c'est sa présence qui masque l'occurrence virtuelle de ce jour.
    expect(isMaterialized(HABIT, D, [row({ habitId: 'h1', habitDate: D })])).toBe(true)
  })

  it('l’occurrence d’une AUTRE habitude au même intitulé ne la masque pas', () => {
    expect(isMaterialized(HABIT, D, [row({ habitId: 'h2', habitDate: D })])).toBe(false)
  })
})

describe('isDue — la date de début (0194, #163)', () => {
  const h = { active: true, weekdays: '1,2,3,4,5,6,7', starts_on: '2026-10-12' }

  it('pas avant sa date de début', () => expect(isDue(h, '2026-10-11')).toBe(false))
  it('dès sa date de début', () => expect(isDue(h, '2026-10-12')).toBe(true))
  it('sans date de début (habitudes d’avant 0194) : comme avant', () =>
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

  it('seulement les habitudes actives de la section, dues ce jour-là', () => {
    expect(dueHabits(habits, D, 'Routine', []).map((h) => h.id)).toEqual(['h1'])
  })

  it('une occurrence déjà matérialisée n’est plus due', () => {
    expect(dueHabits(habits, D, 'Routine', [row({ habitId: 'h1', habitDate: D, label: 'A' })])).toEqual([])
  })
})

describe('isSectionOn — la date de début d’une section (0194, #163)', () => {
  const s = { weekdays: '1,2,3,4,5,6,7', starts_on: '2026-10-12' }

  it('pas avant sa date de début : les semaines passées ne changent pas', () => expect(isSectionOn(s, '2026-10-11')).toBe(false))
  it('dès sa date de début', () => expect(isSectionOn(s, '2026-10-12')).toBe(true))
  it('sans date de début (sections d’avant 0194) : comme avant', () =>
    expect(isSectionOn({ ...s, starts_on: null }, '2020-01-06')).toBe(true))
  it('jour de la semaine non coché : non', () => expect(isSectionOn({ ...s, weekdays: '1' }, '2026-10-13')).toBe(false))
})
