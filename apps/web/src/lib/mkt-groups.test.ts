import { describe, expect, it } from 'vitest'
import { GROUP_PALETTE, NEUTRAL_COLOR, withColors } from './mkt-groups'
import type { MktGroup } from '@/lib/types/marketing'

const g = (o: Partial<MktGroup> & { key: string }): MktGroup => ({
  label: o.key, color: '', pattern: '', priority: 100, isFallback: false, auto: false, ...o,
})

describe('withColors', () => {
  it('ne repeint jamais une couleur déjà choisie', () => {
    const out = withColors([g({ key: 'twitter', color: '#8b5cf6' })])
    expect(out[0].color).toBe('#8b5cf6')
  })

  it('donne le neutre au groupe de repli — la file d attente n attire pas l œil', () => {
    const out = withColors([g({ key: 'other', isFallback: true })])
    expect(out[0].color).toBe(NEUTRAL_COLOR)
  })

  it('pioche une teinte LIBRE pour un groupe neuf, jamais une déjà prise', () => {
    const out = withColors([g({ key: 'twitter', color: GROUP_PALETTE[0] }), g({ key: 'reddit' })])
    expect(out[1].color).toBe(GROUP_PALETTE[1])
  })

  it('retombe sur le neutre quand la palette est épuisée', () => {
    const groupes = [...GROUP_PALETTE].map((c, i) => g({ key: `pris${i}`, color: c }))
    const out = withColors([...groupes, g({ key: 'neuf' })])
    expect(out.at(-1)!.color).toBe(NEUTRAL_COLOR)
  })
})
