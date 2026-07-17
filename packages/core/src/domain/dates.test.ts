import { describe, expect, it } from 'vitest'
import { frDateTimeParis, todayParis } from './dates'

describe('frDateTimeParis', () => {
  it('affiche l’heure Paris (été, CEST = UTC+2)', () => {
    // 14:05 UTC le 16/07 = 16:05 à Paris (CEST)
    expect(frDateTimeParis('2026-07-16T14:05:00Z')).toBe('16/07 16:05')
  })
  it('affiche l’heure Paris (hiver, CET = UTC+1)', () => {
    // 14:05 UTC le 15/01 = 15:05 à Paris (CET)
    expect(frDateTimeParis('2026-01-15T14:05:00Z')).toBe('15/01 15:05')
  })
})

describe('todayParis', () => {
  it('bascule au jour suivant à minuit Paris, pas à minuit UTC (été, CEST = UTC+2)', () => {
    // 22:30 UTC le 15/07 = 00:30 à Paris le 16/07
    expect(todayParis(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
    // 21:30 UTC le 15/07 = 23:30 à Paris le 15/07
    expect(todayParis(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-15')
  })
  it('gère l’heure d’hiver (CET = UTC+1)', () => {
    // 23:30 UTC le 15/01 = 00:30 à Paris le 16/01
    expect(todayParis(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16')
    expect(todayParis(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-15')
  })
  it('format YYYY-MM-DD', () => {
    expect(todayParis(new Date('2026-03-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
