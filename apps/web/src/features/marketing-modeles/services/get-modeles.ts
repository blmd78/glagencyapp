import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getLinkRows } from '@/lib/services/get-mkt-links'
import type { Period } from '@/lib/period'
import { buildDailyShare, buildModeles } from '../aggregate'
import type { CreatorRevenue, DailySubs, MktModelesData } from '../types'

/** Ce que rend la RPC `mkt_creator_revenue` (0152). */
interface RevenuePayload {
  creators: CreatorRevenue[]
  daily: DailySubs[]
}

/**
 * Page Modèles : le CA total de chaque modèle (RPC 0152, `security definer` — la face
 * marketing n'a aucune assignation dans profile_creators, elle ne lit ni le CA ni même les
 * noms) croisé avec ses liens de tracking.
 *
 * UN SEUL fetchAll sur `mkt_link_daily` sert deux usages, comme sur le dashboard marketing
 * (`get-dashboard.ts`) : `getLinkRows` en dérive l'agrégat PAR LIEN via `dailyRows`, et
 * `buildDailyShare` l'agrégat PAR JOUR. Passer la PROMESSE (pas les lignes résolues) préserve
 * le parallélisme : les autres lectures partent en même temps.
 */
export async function getMktModeles(period: Period): Promise<MktModelesData> {
  const supabase = await createClient()
  const dailyPromise = fetchAll((f, t) =>
    supabase
      .from('mkt_link_daily')
      .select('date, link_id, clicks, conversions, revenue_eur')
      .gte('date', period.from)
      .lte('date', period.to)
      .order('link_id')
      .order('date')
      .range(f, t),
  )
  const [revenueRes, links, dailyRes] = await Promise.all([
    supabase.rpc('mkt_creator_revenue', { p_from: period.from, p_to: period.to }),
    getLinkRows(period, { dailyRows: dailyPromise }),
    dailyPromise,
  ])
  if (revenueRes.error) throw new Error(revenueRes.error.message)
  if (dailyRes.error) throw new Error(dailyRes.error.message)

  const payload = (revenueRes.data as RevenuePayload | null) ?? { creators: [], daily: [] }
  const share = buildDailyShare(payload.daily, dailyRes.data)
  return buildModeles(payload.creators, links, share, period.label)
}
