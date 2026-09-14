import { describe, expect, it } from 'vitest'
import { dailySeries } from './daily-series'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'

const row = (o: Partial<MktLinkDailyRow> & { date: string }): MktLinkDailyRow => ({
  link_id: 'l1', clicks: 0, conversions: 0, revenue_eur: 0, ...o,
})

describe('dailySeries', () => {
  it('rend un point par jour de la période, les jours SANS ligne à zéro', () => {
    // Le cœur du problème : `mkt_link_daily` n'écrit aucune ligne un jour sans activité.
    // Sans ce remplissage, la courbe relie le 1er au 3 et invente une continuité.
    const points = dailySeries([row({ date: '2026-09-02', clicks: 7 })], '2026-09-01', '2026-09-03')

    expect(points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(points.map((p) => p.clicks)).toEqual([0, 7, 0])
  })

  it('ADDITIONNE les lignes de plusieurs liens tombant le même jour', () => {
    // Le mode « Tous » cumule les liens d'un réseau : deux lignes du même jour sont deux liens,
    // pas un doublon. Garder la dernière ferait disparaître le trafic de tous les autres.
    const points = dailySeries(
      [
        row({ date: '2026-09-01', link_id: 'a', clicks: 10, conversions: 1, revenue_eur: 5 }),
        row({ date: '2026-09-01', link_id: 'b', clicks: 4, conversions: 2, revenue_eur: 2.5 }),
      ],
      '2026-09-01',
      '2026-09-01',
    )

    expect(points[0]).toEqual({ date: '2026-09-01', clicks: 14, conversions: 3, revenueEur: 7.5 })
  })

  it('convertit le revenu que PostgREST rend en chaîne (colonne numeric)', () => {
    // `revenue_eur` est un `numeric(12,2)` : PostgREST le rend en CHAÎNE. Sans Number(),
    // une somme de points concaténerait « 0 » et « 12.50 » au lieu d'additionner.
    const points = dailySeries(
      [row({ date: '2026-09-01', revenue_eur: '12.50' as unknown as number })],
      '2026-09-01',
      '2026-09-01',
    )

    expect(points[0].revenueEur).toBe(12.5)
  })
})
