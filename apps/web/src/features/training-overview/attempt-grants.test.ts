import { describe, it, expect } from 'vitest'
import { grantExtras, lockedCases } from './attempt-grants'

describe('lockedCases', () => {
  it('garde les exercices sans essai restant, essais redonnés et historique dépassé compris', () => {
    const cases = [
      { id: 'a', max_attempts: 3 },
      { id: 'b', max_attempts: 3 },
      { id: 'c', max_attempts: 3 },
      { id: 'd', max_attempts: 3 },
    ]
    const attempts = new Map([
      ['a', { used: 3, granted: 0 }], // épuisé
      ['b', { used: 3, granted: 1 }], // un essai redonné, pas encore joué
      ['c', { used: 4, granted: 1 }], // l'essai redonné aussi est joué
      ['d', { used: 10, granted: 0 }], // joué avant la limite : 10/3
    ])
    expect(lockedCases(cases, attempts).map((c) => c.id)).toEqual(['a', 'c', 'd'])
  })

  it('un exercice jamais tenté n’est pas bloqué', () => {
    expect(lockedCases([{ id: 'a', max_attempts: 3 }], new Map())).toEqual([])
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
