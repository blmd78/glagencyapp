import { addDays, daysBetween } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import { buildTrafic } from '../aggregate'
import type { TraficData } from '../types'

/**
 * Trafic LinkScale de la période ET de la précédente (évolution et signaux « À regarder ») : une
 * lecture de `mkt_ls_daily` assez large pour la période demandée, que `buildTrafic` recoupe au
 * dernier jour relevé (`dataTo`) — la précédente prend la même durée EFFECTIVE.
 */
export async function getTrafic(period: Period): Promise<TraficData> {
  const supabase = await createClient()
  const prevFrom = addDays(period.from, -(daysBetween(period.from, period.to) + 1))
  const [linksRes, creatorsRes, accountsRes, dailyRes, lastRes] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from('mkt_ls_links')
        .select('id, url, note, creator_id, platform, social_account_id, operator, manual')
        .order('id')
        .range(f, t),
    ),
    supabase.from('creators').select('id, name'),
    supabase.from('mkt_social_accounts').select('id, handle').eq('platform', 'instagram'),
    fetchAll((f, t) =>
      supabase
        .from('mkt_ls_daily')
        .select('link_id, date, visitors, bots, mym_clicks')
        .gte('date', prevFrom)
        .lte('date', period.to)
        .order('link_id')
        .order('date')
        .range(f, t),
    ),
    supabase.from('mkt_ls_daily').select('date').order('date', { ascending: false }).limit(1),
  ])
  if (linksRes.error) throw new Error(linksRes.error.message)
  if (creatorsRes.error) throw new Error(creatorsRes.error.message)
  if (accountsRes.error) throw new Error(accountsRes.error.message)
  if (dailyRes.error) throw new Error(dailyRes.error.message)
  if (lastRes.error) throw new Error(lastRes.error.message)
  return buildTrafic({
    period,
    dataTo: lastRes.data?.[0]?.date ?? null,
    links: linksRes.data ?? [],
    daily: dailyRes.data ?? [],
    creators: creatorsRes.data ?? [],
    accounts: accountsRes.data ?? [],
  })
}
