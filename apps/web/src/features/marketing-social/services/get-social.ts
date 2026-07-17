import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktSocialData, MktSocialRow } from '../types'

/**
 * Comptes sociaux d'une plateforme + agrégats de période depuis mkt_social_daily.
 * followers = dernier relevé ; delta followers = dernier − premier relevé de la période ;
 * vues/engagement = somme des fenêtres 24 h de la période.
 */
export async function getMktSocial(
  platform: 'instagram' | 'twitter' | 'telegram',
  period: Period,
): Promise<MktSocialData> {
  const supabase = await createClient()
  const [{ data: accounts }, { data: creators }, { data: staff }, { data: daily }] =
    await Promise.all([
      supabase.from('mkt_social_accounts').select('id, handle, creator_id, staff_id, active').eq('platform', platform),
      supabase.from('creators').select('id, name'),
      supabase.from('mkt_staff').select('id, name'),
      fetchAll((f, t) =>
        supabase
          .from('mkt_social_daily')
          .select('account_id, date, followers, delta_followers, views_24h, engagement_24h, status')
          .gte('date', period.from)
          .lte('date', period.to)
          .order('account_id')
          .order('date')
          .range(f, t),
      ),
    ])
  const crName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const stName = new Map((staff ?? []).map((s) => [s.id, s.name]))

  const byAcc = new Map<
    string,
    { first: number | null; last: number | null; lastDate: string; views: number; engagement: number; status: string | null }
  >()
  for (const d of daily ?? []) {
    const a = byAcc.get(d.account_id) ?? {
      first: null,
      last: null,
      lastDate: '',
      views: 0,
      engagement: 0,
      status: null,
    }
    if (a.first === null && d.followers != null) a.first = d.followers
    if (d.followers != null) a.last = d.followers
    if (d.date > a.lastDate) {
      a.lastDate = d.date
      a.status = d.status
    }
    a.views += d.views_24h ?? 0
    a.engagement += d.engagement_24h ?? 0
    byAcc.set(d.account_id, a)
  }

  const rows: MktSocialRow[] = (accounts ?? [])
    .map((acc) => {
      const a = byAcc.get(acc.id)
      return {
        id: acc.id,
        handle: acc.handle,
        creator: acc.creator_id ? (crName.get(acc.creator_id) ?? null) : null,
        staff: acc.staff_id ? (stName.get(acc.staff_id) ?? null) : null,
        active: acc.active,
        status: a?.status ?? null,
        followers: a?.last ?? null,
        lastDate: a?.lastDate || null,
        deltaFollowers: a && a.first != null && a.last != null ? a.last - a.first : null,
        viewsPeriod: a ? a.views : null,
        engagementPeriod: platform === 'twitter' && a ? a.engagement : null,
      }
    })
    .sort((x, y) => (y.followers ?? -1) - (x.followers ?? -1))

  const lastDate = rows.reduce<string | null>(
    (mx, r) => (r.lastDate && (!mx || r.lastDate > mx) ? r.lastDate : mx),
    null,
  )
  return {
    period: period.label,
    platform,
    accounts: rows,
    totals: {
      followers: rows.reduce((s, r) => s + (r.followers ?? 0), 0),
      viewsPeriod: rows.reduce((s, r) => s + (r.viewsPeriod ?? 0), 0),
    },
    lastDate,
  }
}
