import { describe, expect, it } from 'vitest'
import { deleteOutcome, dueHabits, isDue, isMaterialized, isSectionOn, isShown, type OccurrenceRow } from './occurrence'

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

  it('l’occurrence d’une AUTRE habitude au même intitulé ne la masque pas', () => {
    expect(isMaterialized(HABIT, D, [row({ habitId: 'h2', habitDate: D })])).toBe(false)
  })
})

describe('isDue — la période (0194, 0196, #163)', () => {
  const h = { active: true, weekdays: '1,2,3,4,5,6,7', starts_on: '2026-10-12', ends_on: null }

  it('pas avant sa date de début', () => expect(isDue(h, '2026-10-11')).toBe(false))
  it('dès sa date de début', () => expect(isDue(h, '2026-10-12')).toBe(true))
  it('sans date de début (habitudes d’avant 0194) : comme avant', () =>
    expect(isDue({ ...h, starts_on: null }, '2020-01-06')).toBe(true))
  it('en pause : jamais', () => expect(isDue({ ...h, active: false }, '2026-10-13')).toBe(false))
  it('jour de la semaine non coché : non', () => expect(isDue({ ...h, weekdays: '1' }, '2026-10-13')).toBe(false))
  // La routine d'un fichier importé du 12 au 31 octobre (retour de Benoit, 2026-10-12).
  it('jusqu’à sa date de fin incluse', () => expect(isDue({ ...h, ends_on: '2026-10-31' }, '2026-10-31')).toBe(true))
  it('plus après sa date de fin', () => expect(isDue({ ...h, ends_on: '2026-10-31' }, '2026-11-01')).toBe(false))
  it('ni avant sa date de début quand les deux sont posées', () =>
    expect(isDue({ ...h, ends_on: '2026-10-31' }, '2026-10-11')).toBe(false))
})

describe('dueHabits', () => {
  const habits = [
    { id: 'h0', label: 'Pause', category: 'Routine', weekdays: '1', active: false, starts_on: null, ends_on: null },
    { id: 'h1', label: 'A', category: 'Routine', weekdays: '1', active: true, starts_on: null, ends_on: null },
    { id: 'h2', label: 'B', category: 'Autre', weekdays: '1', active: true, starts_on: null, ends_on: null },
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

describe('occurrence SAUTÉE (« Juste aujourd’hui », 0195, #170)', () => {
  const sautee = { ...row({ habitId: 'h1', habitDate: D }), skipped: true }

  it('n’est pas affichée…', () => expect(isShown(sautee)).toBe(false))
  it('… mais masque toujours l’occurrence de son habitude : elle ne renaît pas', () => {
    expect(isMaterialized(HABIT, D, [sautee])).toBe(true)
    expect(dueHabits([{ ...HABIT, weekdays: '1', active: true, starts_on: null, ends_on: null }], D, HABIT.category, [sautee])).toEqual([])
  })
  it('une tâche ordinaire reste affichée', () => expect(isShown({ skipped: false })).toBe(true))
})

describe('deleteOutcome — la croix d’une vraie ligne (#170)', () => {
  it('un 1:1 avec bilan : refusé', () => expect(deleteOutcome({ session_id: 's1', habit_id: null }, false)).toBe('refuse'))
  it('une occurrence d’habitude : sautée, pas effacée', () =>
    expect(deleteOutcome({ session_id: null, habit_id: 'h1' }, false)).toBe('skip'))
  it('une occurrence d’avant 0193 reconnue à son habitude : sautée', () =>
    expect(deleteOutcome({ session_id: null, habit_id: null }, true)).toBe('skip'))
  it('une tâche ordinaire : vraiment supprimée', () =>
    expect(deleteOutcome({ session_id: null, habit_id: null }, false)).toBe('delete'))
  it('une ligne déjà disparue : rien à sauter', () => expect(deleteOutcome(null, false)).toBe('delete'))
})

