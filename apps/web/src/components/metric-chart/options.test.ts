import { describe, expect, it } from 'vitest'
import { linksFor, type MetricPoint } from './options'

const point: MetricPoint = {
  date: '2026-10-13',
  revenue: 20,
  conversions: 5,
  clicks: 0,
  byLink: [
    { name: 'B', creator: null, subs: 3, revenue: 0 },
    { name: 'A', creator: null, subs: 2, revenue: 12.5 },
    { name: 'C', creator: null, subs: 0, revenue: 7.5 },
  ],
}

describe('linksFor', () => {
  it('CA : seulement les liens qui en ont rapporté, les plus gros d\u2019abord', () => {
    expect(linksFor(point, 'revenue').map((l) => [l.name, l.value])).toEqual([
      ['A', 12.5],
      ['C', 7.5],
    ])
  })

  it('subs : seulement les liens qui en ont amené, à égalité par nom', () => {
    const p = { ...point, byLink: [...point.byLink!, { name: 'AA', creator: null, subs: 2, revenue: 0 }] }
    expect(linksFor(p, 'conversions').map((l) => [l.name, l.value])).toEqual([
      ['B', 3],
      ['A', 2],
      ['AA', 2],
    ])
  })

  it('sans répartition (la modale d\u2019un lien) : rien', () => {
    expect(linksFor({ ...point, byLink: undefined }, 'revenue')).toEqual([])
  })
})
