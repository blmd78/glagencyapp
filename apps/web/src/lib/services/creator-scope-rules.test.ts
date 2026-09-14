import { describe, expect, it } from 'vitest'
import { creatorsByProfile, inCreatorScope } from './creator-scope-rules'

const ALICE = 'creator-alice'
const SARAH = 'creator-sarah'

describe('creatorsByProfile (les modèles d’un chatteur, par ses DEUX rattachements)', () => {
  it('compte le rattachement MyPuls même sans rattachement du compte — le chatteur du Relevé absent de Police', () => {
    const map = creatorsByProfile([], [{ chatter_id: 'ch-1', creator_id: ALICE }], [{ id: 'p-1', chatter_id: 'ch-1' }])
    expect([...(map.get('p-1') ?? [])]).toEqual([ALICE])
  })
  it('réunit les deux sources', () => {
    const map = creatorsByProfile(
      [{ profile_id: 'p-1', creator_id: SARAH }],
      [{ chatter_id: 'ch-1', creator_id: ALICE }],
      [{ id: 'p-1', chatter_id: 'ch-1' }],
    )
    expect([...(map.get('p-1') ?? [])].sort()).toEqual([ALICE, SARAH].sort())
  })
  it('un compte sans chatteur MyPuls garde ses seuls rattachements de compte', () => {
    const map = creatorsByProfile(
      [{ profile_id: 'p-2', creator_id: SARAH }],
      [{ chatter_id: 'ch-1', creator_id: ALICE }],
      [{ id: 'p-2', chatter_id: null }],
    )
    expect([...(map.get('p-2') ?? [])]).toEqual([SARAH])
  })
})

describe('inCreatorScope', () => {
  it('sans borne (admin, encadrant sans modèle) → toujours dans le périmètre', () => {
    expect(inCreatorScope(null, undefined)).toBe(true)
  })
  it('dans le périmètre dès qu’un modèle est partagé, hors sinon', () => {
    expect(inCreatorScope(new Set([ALICE]), new Set([SARAH, ALICE]))).toBe(true)
    expect(inCreatorScope(new Set([ALICE]), new Set([SARAH]))).toBe(false)
    expect(inCreatorScope(new Set([ALICE]), undefined)).toBe(false)
  })
})
