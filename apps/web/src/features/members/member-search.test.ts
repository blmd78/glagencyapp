import { describe, expect, it } from 'vitest'
import { memberMatches } from './member-search'

const cedric = { displayName: 'Cedric Agbotounso', email: 'roccahcedric@gmail.com', discord: 'junot' }

describe('memberMatches (recherche Membres : nom, e-mail, pseudo Discord)', () => {
  it('trouve par le nom, sans tenir compte de la casse', () => {
    expect(memberMatches(cedric, 'agbo')).toBe(true)
  })
  it('trouve par l’e-mail — « le mail existe déjà mais je ne le vois nulle part » (2026-09-12)', () => {
    expect(memberMatches(cedric, 'roccahcedric@gmail.com')).toBe(true)
    expect(memberMatches(cedric, 'roccah')).toBe(true)
  })
  it('trouve par le pseudo Discord', () => {
    expect(memberMatches(cedric, 'JUNOT')).toBe(true)
  })
  it('ignore les accents, dans les deux sens', () => {
    expect(memberMatches(cedric, 'cédric')).toBe(true)
    expect(memberMatches({ ...cedric, displayName: 'Cédric' }, 'cedric')).toBe(true)
  })
  it('recherche vide → tout le monde ; sans Discord → pas de plantage', () => {
    expect(memberMatches(cedric, '  ')).toBe(true)
    expect(memberMatches({ ...cedric, discord: null }, 'junot')).toBe(false)
  })
})
