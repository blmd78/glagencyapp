import { describe, expect, it } from 'vitest'
import { daysIn, fortnightOf, fortnightsOfMonth, mondaysIn, recentFortnights } from './periods'

describe('fortnightOf', () => {
  it('range un jour <= 15 en periode 1', () => {
    expect(fortnightOf('2026-07-01')).toEqual({
      month: '2026-07-01', period: 1, from: '2026-07-01', to: '2026-07-15',
      label: '1–15 juillet 2026',
    })
    expect(fortnightOf('2026-07-15').period).toBe(1)
  })

  it('range un jour >= 16 en periode 2, bornee a la fin du mois', () => {
    expect(fortnightOf('2026-07-16')).toEqual({
      month: '2026-07-01', period: 2, from: '2026-07-16', to: '2026-07-31',
      label: '16–31 juillet 2026',
    })
  })

  it('gere fevrier (28 jours)', () => {
    expect(fortnightOf('2027-02-20').to).toBe('2027-02-28')
    expect(fortnightOf('2027-02-20').label).toBe('16–28 février 2027')
  })
})

describe('fortnightsOfMonth', () => {
  it('renvoie les deux quinzaines dans l ordre', () => {
    const [p1, p2] = fortnightsOfMonth('2026-07-01')
    expect([p1.period, p2.period]).toEqual([1, 2])
    expect([p1.from, p1.to, p2.from, p2.to]).toEqual(
      ['2026-07-01', '2026-07-15', '2026-07-16', '2026-07-31'],
    )
  })
})

describe('mondaysIn — rattachement des semaines par leur lundi', () => {
  it('juillet 2026 P1 recupere les lundis 06 et 13', () => {
    expect(mondaysIn(fortnightOf('2026-07-01'))).toEqual(['2026-07-06', '2026-07-13'])
  })

  it('juillet 2026 P2 recupere les lundis 20 et 27', () => {
    expect(mondaysIn(fortnightOf('2026-07-16'))).toEqual(['2026-07-20', '2026-07-27'])
  })

  it('une semaine a cheval part avec son lundi, jamais decoupee', () => {
    // Sem. 13→19 juillet : 3 jours en P1, 4 en P2. Lundi en P1 → toute la semaine en P1.
    expect(mondaysIn(fortnightOf('2026-07-14'))).toContain('2026-07-13')
    expect(mondaysIn(fortnightOf('2026-07-17'))).not.toContain('2026-07-13')
  })

  it('une quinzaine peut contenir 3 lundis', () => {
    // Juin 2026 : lundis 01, 08, 15 → P1 en a trois.
    expect(mondaysIn(fortnightOf('2026-06-01'))).toEqual(['2026-06-01', '2026-06-08', '2026-06-15'])
  })
})

describe('daysIn', () => {
  it('enumere tous les jours bornes inclus', () => {
    const d = daysIn(fortnightOf('2026-07-01'))
    expect(d).toHaveLength(15)
    expect(d[0]).toBe('2026-07-01')
    expect(d[14]).toBe('2026-07-15')
  })

  it('P2 de juillet fait 16 jours', () => {
    expect(daysIn(fortnightOf('2026-07-16'))).toHaveLength(16)
  })
})

describe('recentFortnights', () => {
  it('renvoie n quinzaines, la plus recente d abord, sans trou', () => {
    const list = recentFortnights('2026-07-20', 4)
    expect(list.map((f) => `${f.from}→${f.to}`)).toEqual([
      '2026-07-16→2026-07-31',
      '2026-07-01→2026-07-15',
      '2026-06-16→2026-06-30',
      '2026-06-01→2026-06-15',
    ])
  })
})
