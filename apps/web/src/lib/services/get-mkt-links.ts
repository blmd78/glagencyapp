import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktLinkRow } from '@/lib/types/marketing'

const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * Agrégats par lien sur la période — socle des pages Liens, Dashboard et Social
 * (instagram/twitter/telegram) : PARTAGÉ entre marketing-liens, marketing-dashboard
 * et marketing-social, d'où sa place ici plutôt que dans une feature.
 */
export async function getLinkRows(period: Period): Promise<MktLinkRow[]> {
  const supabase = await createClient()
  const [{ data: links }, { data: creators }, { data: staffLinks }, { data: staff }, { data: daily }] = await Promise.all([
    supabase.from('mkt_links').select('id, name, type, url, creator_id, active'),
    supabase.from('creators').select('id, name'),
    // Assignations VA : le RLS (owner_id, migration 0027) fait qu'un manager ne récupère
    // que SES fiches → il ne voit les étiquettes VA que sur ses propres liens.
    supabase.from('mkt_staff_links').select('staff_id, link_id'),
    supabase.from('mkt_staff').select('id, name, color'),
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
  const staffById = new Map((staff ?? []).map((s) => [s.id, { name: s.name, color: s.color }]))
  const staffByLink = new Map<string, { name: string; color: string }[]>()
  for (const sl of staffLinks ?? []) {
    const s = staffById.get(sl.staff_id)
    if (s) staffByLink.set(sl.link_id, [...(staffByLink.get(sl.link_id) ?? []), s])
  }
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
        staff: staffByLink.get(l.id) ?? [],
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
