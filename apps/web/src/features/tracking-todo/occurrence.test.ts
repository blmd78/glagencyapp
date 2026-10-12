import { describe, expect, it } from 'vitest'
import { isMaterialized } from './occurrence'

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
