import { describe, expect, it } from 'vitest'
import { segmentsToJson, toSegments } from './mappers'

describe('toSegments', () => {
  it('lit la forme de la seed 0136', () => {
    expect(toSegments([{ label: '6 €', weight: 1, amount_eur: 6 }])).toEqual([
      { label: '6 €', weight: 1, amountEur: 6 },
    ])
  })

  it('refuse un tableau vide (une roue sans secteur ne tourne pas)', () => {
    expect(() => toSegments([])).toThrow()
  })

  it('refuse un poids décimal — randomInt(0, n) throw sur un n non entier', () => {
    expect(() => toSegments([{ label: '6 €', weight: 1.5, amount_eur: 6 }])).toThrow()
  })

  it('refuse un montant négatif — il passerait la lecture puis violerait le check SQL APRÈS avoir consommé le ticket', () => {
    expect(() => toSegments([{ label: 'x', weight: 1, amount_eur: -1 }])).toThrow()
  })

  it('refuse un montant absent : sur CETTE roue, tout secteur paie', () => {
    expect(() => toSegments([{ label: '6 €', weight: 1 }])).toThrow()
  })
})

describe('segmentsToJson', () => {
  it('renomme amountEur en amount_eur', () => {
    expect(segmentsToJson([{ label: '8 €', weight: 1, amountEur: 8 }])).toEqual([
      { label: '8 €', weight: 1, amount_eur: 8 },
    ])
  })
})
