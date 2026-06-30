import { describe, it, expect } from 'vitest'
import { runRules } from './engine'

describe('runRules', () => {
  it('renvoie un tableau (stub — aucune règle ne produit encore d’insight)', () => {
    expect(runRules({})).toEqual([])
  })
})
