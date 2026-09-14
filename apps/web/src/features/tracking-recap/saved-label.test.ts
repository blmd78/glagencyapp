import { describe, expect, it } from 'vitest'
import { savedLabel } from './saved-label'

describe('savedLabel (heure d’enregistrement d’un débrief, lue à Paris)', () => {
  it('rend l’heure de Paris et non l’UTC — le débrief de Dorian, 01:05 UTC, a été écrit à 03:05', () => {
    expect(savedLabel('2026-09-14T01:05:07.231+00:00')).toBe('lundi 14/09 à 03:05')
  })
  it('suit l’heure d’hiver, et change de jour quand minuit passe à Paris', () => {
    expect(savedLabel('2026-12-01T23:30:00Z')).toBe('mercredi 02/12 à 00:30')
  })
})
