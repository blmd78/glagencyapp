import { describe, expect, it } from 'vitest'
import { dailySeries, toMetricPoints } from './daily-series'
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

    expect(points[0]).toEqual({
      date: '2026-09-01',
      clicks: 14,
      conversions: 3,
      revenueEur: 7.5,
      byLink: [
        { linkId: 'a', subs: 1, revenue: 5 },
        { linkId: 'b', subs: 2, revenue: 2.5 },
      ],
    })
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

describe('répartition par lien (infobulle d\u2019un cumul)', () => {
  const rows = [
    row({ date: '2026-10-13', link_id: 'a', clicks: 30, conversions: 0, revenue_eur: 12.5 }),
    row({ date: '2026-10-13', link_id: 'b', clicks: 8, conversions: 2, revenue_eur: 0 }),
    // Que des clics : ni sub ni CA, il n'a rien à faire dans la répartition.
    row({ date: '2026-10-13', link_id: 'c', clicks: 50 }),
  ]
  const links = [
    { id: 'a', name: 'IG_BIO', creator: 'Modèle A' },
    { id: 'b', name: 'TT_STORY', creator: null },
    { id: 'c', name: 'X_POST', creator: 'Modèle A' },
  ]

  it('garde chaque lien qui a amené un sub OU du CA, pas ceux qui n\u2019ont que des clics', () => {
    const [p] = dailySeries(rows, '2026-10-13', '2026-10-13')
    expect(p.byLink).toEqual([
      { linkId: 'a', subs: 0, revenue: 12.5 },
      { linkId: 'b', subs: 2, revenue: 0 },
    ])
  })

  it('nomme les liens quand plusieurs sont tracés', () => {
    const [p] = toMetricPoints(dailySeries(rows, '2026-10-13', '2026-10-13'), links)
    expect(p.byLink).toEqual([
      { name: 'IG_BIO', creator: 'Modèle A', subs: 0, revenue: 12.5 },
      { name: 'TT_STORY', creator: null, subs: 2, revenue: 0 },
    ])
  })

  it('ne répartit rien pour un seul lien : la répartition redirait son total', () => {
    const [p] = toMetricPoints(dailySeries(rows.slice(0, 1), '2026-10-13', '2026-10-13'), links.slice(0, 1))
    expect(p.byLink).toBeUndefined()
  })
})
