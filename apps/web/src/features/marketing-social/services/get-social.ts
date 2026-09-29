import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { MktSocialData, MktSocialRow } from '../types'

/**
 * Comptes sociaux d'une plateforme + agrégats de période depuis mkt_social_daily.
 * followers = dernier relevé ; delta followers = dernier − premier relevé de la période ;
 * vues/engagement = somme des fenêtres 24 h de la période. Pour X (0177/0178) : tweets publiés =
 * dernier − premier total de tweets de la période, le reste du profil = son dernier relevé.
 */
export async function getMktSocial(
  platform: 'instagram' | 'twitter' | 'telegram',
  period: Period,
): Promise<MktSocialData> {
  const supabase = await createClient()
  const [accountsRes, creatorsRes, staffRes, dailyRes] = await Promise.all([
    supabase
      .from('mkt_social_accounts')
      .select('id, handle, creator_id, staff_id, active, x_name, x_avatar_url, x_created_at')
      .eq('platform', platform),
    supabase.from('creators').select('id, name'),
    supabase.from('mkt_staff').select('id, name'),
    fetchAll((f, t) =>
      supabase
        .from('mkt_social_daily')
        .select(
          'account_id, date, followers, delta_followers, views_24h, engagement_24h, status, following, posts_total, listed, bio_url, bio_text, last_post_at, x_verified_type, withheld_countries',
        )
        .gte('date', period.from)
        .lte('date', period.to)
        .order('account_id')
        .order('date')
        .range(f, t),
    ),
  ])
  if (accountsRes.error) throw new Error(accountsRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (staffRes.error) throw new Error(staffRes.error.message)
  if (dailyRes.error) throw new Error(dailyRes.error.message)
  const { data: accounts } = accountsRes
  const { data: creators } = creatorsRes
  const { data: staff } = staffRes
  const { data: daily } = dailyRes
  const crName = new Map((creators ?? []).map((c) => [c.id, c.name]))
  const stName = new Map((staff ?? []).map((s) => [s.id, s.name]))

  type Acc = {
    first: number | null
    last: number | null
    firstPosts: number | null
    lastPosts: number | null
    lastDate: string
    views: number
    engagement: number
    /** La ligne du dernier relevé de la période. */
    latest: NonNullable<typeof daily>[number] | null
  }
  const byAcc = new Map<string, Acc>()
  for (const d of daily ?? []) {
    const a: Acc = byAcc.get(d.account_id) ?? {
      first: null,
      last: null,
      firstPosts: null,
      lastPosts: null,
      lastDate: '',
      views: 0,
      engagement: 0,
      latest: null,
    }
    if (a.first === null && d.followers != null) a.first = d.followers
    if (d.followers != null) a.last = d.followers
    if (a.firstPosts === null && d.posts_total != null) a.firstPosts = d.posts_total
    if (d.posts_total != null) a.lastPosts = d.posts_total
    if (d.date > a.lastDate) {
      a.lastDate = d.date
      a.latest = d
    }
    a.views += d.views_24h ?? 0
    a.engagement += d.engagement_24h ?? 0
    byAcc.set(d.account_id, a)
  }

  const rows: MktSocialRow[] = (accounts ?? [])
    .map((acc) => {
      const a = byAcc.get(acc.id)
      const l = a?.latest ?? null
      return {
        id: acc.id,
        handle: acc.handle,
        creator: acc.creator_id ? (crName.get(acc.creator_id) ?? null) : null,
        staff: acc.staff_id ? (stName.get(acc.staff_id) ?? null) : null,
        active: acc.active,
        status: l?.status ?? null,
        followers: a?.last ?? null,
        lastDate: a?.lastDate || null,
        deltaFollowers: a && a.first != null && a.last != null ? a.last - a.first : null,
        viewsPeriod: a ? a.views : null,
        engagementPeriod: platform === 'twitter' && a ? a.engagement : null,
        // Des tweets supprimés font baisser le total : « publiés » ne descend pas sous zéro.
        postsPeriod:
          a && a.firstPosts != null && a.lastPosts != null ? Math.max(0, a.lastPosts - a.firstPosts) : null,
        following: l?.following ?? null,
        listed: l?.listed ?? null,
        bioUrl: l?.bio_url ?? null,
        bioText: l?.bio_text ?? null,
        lastPostAt: l?.last_post_at ?? null,
        verifiedType: l?.x_verified_type ?? null,
        withheldCountries: l?.withheld_countries ?? null,
        name: acc.x_name,
        avatarUrl: acc.x_avatar_url,
        accountCreatedAt: acc.x_created_at,
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
