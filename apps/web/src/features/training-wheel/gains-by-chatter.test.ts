import { describe, it, expect } from 'vitest'
import { gainsByChatter } from './gains-by-chatter'
import type { WheelHistoryRow } from './types'

const row = (o: Partial<WheelHistoryRow>): WheelHistoryRow => ({
  id: 'x',
  profileId: 'p1',
  displayName: 'Chatteur A',
  spunByName: null,
  origine: 'Encadrant',
  week: '2026-10-12',
  spunAt: '2026-10-12T10:00:00Z',
  won: true,
  prizeLabel: '5 €',
  amountEur: 5,
  paidAt: null,
  ...o,
})

describe('gainsByChatter', () => {
  it('additionne les gains de chaque chatteur, du plus gros total au plus petit', () => {
    const rows = [
      row({ profileId: 'p1', displayName: 'Chatteur A', amountEur: 5 }),
      row({ profileId: 'p2', displayName: 'Chatteur B', amountEur: 20 }),
      row({ profileId: 'p1', displayName: 'Chatteur A', amountEur: 8 }),
    ]
    expect(gainsByChatter(rows)).toEqual([
      { profileId: 'p2', displayName: 'Chatteur B', totalEur: 20 },
      { profileId: 'p1', displayName: 'Chatteur A', totalEur: 13 },
    ])
  })

  it('écarte qui n’a rien gagné en argent : Raté, lot non monétaire', () => {
    const rows = [
      row({ profileId: 'p1', won: false, prizeLabel: null, amountEur: null }),
      row({ profileId: 'p2', displayName: 'Chatteur B', prizeLabel: 'Day off', amountEur: null }),
      row({ profileId: 'p3', displayName: 'Chatteur C', amountEur: 10 }),
    ]
    expect(gainsByChatter(rows)).toEqual([{ profileId: 'p3', displayName: 'Chatteur C', totalEur: 10 }])
  })

  it('à total égal, par nom ; deux chatteurs sortis du roster (« — ») restent distincts', () => {
    const rows = [
      row({ profileId: 'p1', displayName: 'Chatteur B', amountEur: 5 }),
      row({ profileId: 'p2', displayName: 'Chatteur A', amountEur: 5 }),
      row({ profileId: 'p3', displayName: '—', amountEur: 8 }),
      row({ profileId: 'p4', displayName: '—', amountEur: 8 }),
    ]
    expect(gainsByChatter(rows).map((g) => g.profileId)).toEqual(['p3', 'p4', 'p2', 'p1'])
  })
})
