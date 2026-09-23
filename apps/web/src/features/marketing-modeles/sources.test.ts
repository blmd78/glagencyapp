import { describe, expect, it } from 'vitest'
import { sourcesOf } from './sources'
import { NEUTRAL_COLOR } from '@/lib/mkt-groups'
import type { MktGroup, MktLinkRow } from '@/lib/types/marketing'

const link = (o: Partial<MktLinkRow> & { id: string }): MktLinkRow => ({
  name: o.id, type: 'twitter', url: '', creatorId: null, creator: null, staff: [], active: true,
  clicks: 0, conversions: 0, revenueEur: 0, ltv: null, taux: null, ...o,
})
const g = (key: string, label: string, color: string): MktGroup => ({
  key, label, color, contains: [], startsWith: [], words: [], priority: 10, isFallback: false, auto: false,
})
const GROUPES = [g('instagram', 'Instagram', '#ec4899'), g('snapchat', 'Snapchat', '#ca8a04')]

describe('sourcesOf', () => {
  it('regroupe les liens d une modèle par réseau et additionne', () => {
    const s = sourcesOf(
      [
        link({ id: 'a', type: 'instagram', clicks: 100, conversions: 10, revenueEur: 50 }),
        link({ id: 'b', type: 'instagram', clicks: 100, conversions: 20, revenueEur: 25.5 }),
        link({ id: 'c', type: 'snapchat', clicks: 10, conversions: 5, revenueEur: 0 }),
      ],
      GROUPES,
    )
    expect(s.map((x) => [x.key, x.liens, x.clicks, x.conversions, x.revenueEur])).toEqual([
      ['instagram', 2, 200, 30, 75.5],
      ['snapchat', 1, 10, 5, 0],
    ])
    expect(s[0].label).toBe('Instagram')
    expect(s[0].color).toBe('#ec4899')
  })

  it('calcule part et taux sur les SOMMES', () => {
    const s = sourcesOf(
      [
        link({ id: 'a', type: 'instagram', clicks: 10, conversions: 1 }),
        link({ id: 'b', type: 'instagram', clicks: 90, conversions: 10 }),
        link({ id: 'c', type: 'snapchat', clicks: 10, conversions: 9 }),
      ],
      GROUPES,
    )
    // 11 abonnés Instagram sur 20 → 55 % ; taux 11 / 100 = 11 %, pas la moyenne des taux.
    expect(s[0]).toMatchObject({ key: 'instagram', part: 55, taux: 11 })
    expect(s[1]).toMatchObject({ key: 'snapchat', part: 45, taux: 90 })
  })

  it('classe par abonnés, puis par revenus', () => {
    const s = sourcesOf(
      [
        link({ id: 'a', type: 'instagram', conversions: 3, revenueEur: 1 }),
        link({ id: 'b', type: 'snapchat', conversions: 3, revenueEur: 9 }),
      ],
      GROUPES,
    )
    expect(s.map((x) => x.key)).toEqual(['snapchat', 'instagram'])
  })

  it('rend part et taux nuls plutôt que 0 quand il n y a pas de base', () => {
    const s = sourcesOf([link({ id: 'a', type: 'instagram' })], GROUPES)
    expect(s[0].part).toBeNull()
    expect(s[0].taux).toBeNull()
  })

  it('garde les liens d un groupe inconnu, sous sa clé et en neutre', () => {
    const s = sourcesOf([link({ id: 'a', type: 'reddit', conversions: 2 })], GROUPES)
    expect(s[0]).toMatchObject({ key: 'reddit', label: 'reddit', color: NEUTRAL_COLOR })
  })
})
