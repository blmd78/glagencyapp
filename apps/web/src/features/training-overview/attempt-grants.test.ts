import { describe, it, expect } from 'vitest'
import { grantExtras, selectionGrants } from './attempt-grants'

describe('selectionGrants', () => {
  const cases = [
    { id: 'a', max_attempts: 3 },
    { id: 'b', max_attempts: 3 },
    { id: 'c', max_attempts: 3 },
    { id: 'd', max_attempts: 3 },
  ]
  const attempts = new Map([
    ['a', { used: 3, granted: 0 }], // bloqué
    ['b', { used: 1, granted: 0 }], // libre, déjà joué
    ['c', { used: 10, granted: 0 }], // joué avant la limite : 10/3
  ])

  it('les niveaux sélectionnés et déjà joués, N parties de plus chacun (dépassement compensé)', () => {
    expect(selectionGrants(cases, attempts, ['a', 'b', 'c'], 5)).toEqual([
      { caseId: 'a', extra: 5 },
      { caseId: 'b', extra: 5 },
      { caseId: 'c', extra: 12 },
    ])
  })

  it('ignore un niveau jamais joué, hors sélection ou inconnu du catalogue', () => {
    expect(selectionGrants(cases, attempts, ['a', 'd', 'zz'], 2)).toEqual([{ caseId: 'a', extra: 2 }])
  })
})

describe('grantExtras — N parties de plus qu’aujourd’hui', () => {
  it('sans dépassement : N, tel quel (bloqué ou non)', () => {
    expect(grantExtras(5, 3, { used: 3, granted: 0 })).toEqual([5])
    expect(grantExtras(5, 3, { used: 1, granted: 0 })).toEqual([5])
    expect(grantExtras(1, 3, undefined)).toEqual([1])
  })

  it('historique dépassé (10/3) : N plus le dépassement, pour 10/15 et 5 parties', () => {
    expect(grantExtras(5, 3, { used: 10, granted: 0 })).toEqual([12])
    expect(grantExtras(5, 3, { used: 10, granted: 2 })).toEqual([10])
  })

  it('au-delà de 20 (borne de la colonne) : plusieurs lignes dont la somme fait le compte', () => {
    expect(grantExtras(5, 3, { used: 40, granted: 0 })).toEqual([20, 20, 2])
  })
})
