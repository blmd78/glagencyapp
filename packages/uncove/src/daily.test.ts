import { describe, expect, it } from 'vitest'
import { mergeDaily } from './daily'

describe('mergeDaily — fusion des séries Subs + CA par jour (union, zéro-remplie, triée)', () => {
  it('unit les jours des deux séries, comble à 0, trie par date', () => {
    const subs = [
      { day: '2026-09-02', new: 1, canceled: 0, current: 752 },
      { day: '2026-09-01', new: 0, canceled: 0, current: 751 },
    ]
    const revenue = [
      { day: '2026-09-03', revenue: 3 },
      { day: '2026-09-02', revenue: 12.5 },
    ]
    expect(mergeDaily(subs, revenue)).toEqual([
      { day: '2026-09-01', new: 0, canceled: 0, current: 751, revenue: 0 },
      { day: '2026-09-02', new: 1, canceled: 0, current: 752, revenue: 12.5 },
      { day: '2026-09-03', new: 0, canceled: 0, current: 0, revenue: 3 },
    ])
  })
})
