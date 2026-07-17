import { daysBetween } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktDashboardData } from '../types'
import { getLinkRows } from '@/lib/services/get-mkt-links'

const r2 = (v: number) => Math.round(v * 100) / 100

/** Dashboard marketing : KPIs, série journalière, top liens, répartition par créatrice. */
export async function getMktDashboard(period: Period): Promise<MktDashboardData> {
  const supabase = await createClient()
  const days = daysBetween(period.from, period.to) + 1
  // Fenêtre précédente de même durée, adjacente (pour « vs période préc. »).
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const prevTo = iso(new Date(new Date(`${period.from}T00:00:00Z`).getTime() - 86_400_000))
  const prevFrom = iso(new Date(new Date(`${period.from}T00:00:00Z`).getTime() - days * 86_400_000))
  const [links, { data: daily }, { data: prevDaily }] = await Promise.all([
    getLinkRows(period),
    fetchAll((f, t) =>
      supabase
        .from('mkt_link_daily')
        .select('date, clicks, conversions, revenue_eur')
        .gte('date', period.from)
        .lte('date', period.to)
        .order('link_id')
        .order('date')
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase
        .from('mkt_link_daily')
        .select('revenue_eur')
        .gte('date', prevFrom)
        .lte('date', prevTo)
        .order('link_id')
        .order('date')
        .range(f, t),
    ),
  ])

  const byDay = new Map<string, { revenue: number; conversions: number; clicks: number }>()
  for (const d of daily ?? []) {
    const a = byDay.get(d.date) ?? { revenue: 0, conversions: 0, clicks: 0 }
    a.revenue += Number(d.revenue_eur)
    a.conversions += d.conversions
    a.clicks += d.clicks
    byDay.set(d.date, a)
  }

  const byCreator = new Map<string, { revenueEur: number; conversions: number; clicks: number }>()
  for (const l of links) {
    const key = l.creator ?? '—'
    const a = byCreator.get(key) ?? { revenueEur: 0, conversions: 0, clicks: 0 }
    a.revenueEur += l.revenueEur
    a.conversions += l.conversions
    a.clicks += l.clicks
    byCreator.set(key, a)
  }

  const clicks = links.reduce((s, l) => s + l.clicks, 0)
  const conversions = links.reduce((s, l) => s + l.conversions, 0)
  const revenueEur = r2(links.reduce((s, l) => s + l.revenueEur, 0))
  const dailyPoints = [...byDay.entries()]
    .map(([date, a]) => ({ date, revenue: r2(a.revenue), conversions: a.conversions, clicks: a.clicks }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const best = dailyPoints.reduce<{ date: string; revenue: number } | null>(
    (mx, d) => (mx === null || d.revenue > mx.revenue ? { date: d.date, revenue: d.revenue } : mx),
    null,
  )
  const byCreatorSorted = [...byCreator.entries()]
    .map(([creator, a]) => ({ creator, ...a, revenueEur: r2(a.revenueEur) }))
    .sort((a, b) => b.revenueEur - a.revenueEur)
  const topCr = byCreatorSorted.find((c) => c.creator !== '—' && c.revenueEur > 0) ?? null

  return {
    period: period.label,
    totals: {
      clicks,
      conversions,
      revenueEur,
      ltv: conversions > 0 ? r2(revenueEur / conversions) : null,
    },
    prevRevenueEur: r2((prevDaily ?? []).reduce((s, d) => s + Number(d.revenue_eur), 0)),
    days,
    avgRevenuePerDay: r2(revenueEur / days),
    bestDay: best,
    topCreator: topCr ? { name: topCr.creator, revenueEur: topCr.revenueEur } : null,
    daily: dailyPoints,
    topLinks: links.filter((l) => l.revenueEur > 0 || l.clicks > 0).slice(0, 10),
    byCreator: byCreatorSorted,
  }
}
