import { describe, it, expect } from 'vitest'
import { toAttributionUpdate } from './attribution'

const base = { creatorId: 'c1', socialAccountId: 'a1', operator: ' jade ' }

describe('toAttributionUpdate', () => {
  it('X : garde l’opérateur en majuscules, jamais de compte Instagram', () => {
    expect(toAttributionUpdate({ ...base, platform: 'x' })).toEqual({
      creator_id: 'c1',
      platform: 'x',
      social_account_id: null,
      operator: 'JADE',
      manual: true,
    })
  })
  it('Instagram : garde le compte, jamais d’opérateur', () => {
    expect(toAttributionUpdate({ ...base, platform: 'instagram' })).toMatchObject({ social_account_id: 'a1', operator: null })
  })
  it('autre réseau : ni compte ni opérateur ; opérateur vide = null', () => {
    expect(toAttributionUpdate({ ...base, platform: 'snapchat' })).toMatchObject({ social_account_id: null, operator: null })
    expect(toAttributionUpdate({ ...base, platform: 'x', operator: '  ' }).operator).toBeNull()
  })
})
