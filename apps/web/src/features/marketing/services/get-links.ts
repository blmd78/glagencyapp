import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktLinkRow, MktLinksData } from '../types'

const r2 = (v: number) => Math.round(v * 100) / 100

/** Agrégats par lien sur la période — socle des pages Liens et Dashboard. */
export async function getLinkRows(period: Period): Promise<MktLinkRow[]> {
  const supabase = await createClient()
  const [{ data: links }, { data: creators }, { data: daily }] = await Promise.all([
    supabase.from('mkt_links').select('id, name, type, url, creator_id, active'),
    supabase.from('creators').select('id, name'),
    fetchAll((f, t) =>
      supabase
        .from('mkt_link_daily')
        .select('link_id, clicks, conversions, revenue_eur')
        .gte('date', period.from)
        .lte('date', period.to)
        .order('link_id')
        .order('date')
        .range(f, t),
    ),
  ])
  const crName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const agg = new Map<string, { clicks: number; conversions: number; revenue: number }>()
  for (const d of daily ?? []) {
    const a = agg.get(d.link_id) ?? { clicks: 0, conversions: 0, revenue: 0 }
    a.clicks += d.clicks
    a.conversions += d.conversions
    a.revenue += Number(d.revenue_eur)
    agg.set(d.link_id, a)
  }
  return (links ?? [])
    .map((l) => {
      const a = agg.get(l.id) ?? { clicks: 0, conversions: 0, revenue: 0 }
      return {
        id: l.id,
        name: l.name,
        type: (l.type ?? 'other') as MktLinkRow['type'],
        url: l.url,
        creator: l.creator_id ? (crName.get(l.creator_id) ?? null) : null,
        active: l.active,
        clicks: a.clicks,
        conversions: a.conversions,
        revenueEur: r2(a.revenue),
        ltv: a.conversions > 0 ? r2(a.revenue / a.conversions) : null,
        taux: a.clicks > 0 ? Math.round((a.conversions / a.clicks) * 1000) / 10 : null,
      }
    })
    .sort((a, b) => b.revenueEur - a.revenueEur || b.clicks - a.clicks)
}

/** Page Liens : tous les liens (actifs et disparus) avec leurs agrégats de période. */
export async function getMktLinks(period: Period): Promise<MktLinksData> {
  const links = await getLinkRows(period)
  return {
    period: period.label,
    links,
    totals: {
      clicks: links.reduce((s, l) => s + l.clicks, 0),
      conversions: links.reduce((s, l) => s + l.conversions, 0),
      revenueEur: r2(links.reduce((s, l) => s + l.revenueEur, 0)),
    },
  }
}
