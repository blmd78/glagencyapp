import { createClient } from '@/lib/supabase/server'
import type { UncoveDashboardData, UncoveAccountStat, UncoveStatus } from '../types'

const PERIOD_DAYS = 30

/**
 * Dashboard Uncove : agrégat Subs + CA par compte sur les {PERIOD_DAYS} derniers jours.
 * Lecture via le client serveur (RLS `has_page('uncove')` / admin). Volume borné (comptes ×
 * ~30 jours ≪ 1000) → pas de fetchAll. Tables 0163 pas encore typées → `as never` + cast.
 */
export async function getUncoveDashboard(): Promise<UncoveDashboardData> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10)

  const [accRes, dailyRes] = await Promise.all([
    supabase.from('uncove_accounts' as never).select('id, label, status').order('label'),
    supabase
      .from('uncove_daily' as never)
      .select('account_id, day, subs_new, subs_canceled, subs_current, revenue')
      .gte('day', cutoff)
      .order('day'),
  ])
  if (accRes.error) throw new Error(accRes.error.message)
  if (dailyRes.error) throw new Error(dailyRes.error.message)

  const accounts = (accRes.data ?? []) as unknown as Array<{ id: string; label: string; status: UncoveStatus }>
  const daily = (dailyRes.data ?? []) as unknown as Array<{
    account_id: string
    day: string
    subs_new: number
    subs_canceled: number
    subs_current: number
    revenue: number
  }>

  const stats: UncoveAccountStat[] = accounts.map((a) => {
    const rows = daily.filter((d) => d.account_id === a.id)
    const last = rows.at(-1) // trié par day croissant → dernier = jour le plus récent
    return {
      id: a.id,
      label: a.label,
      status: a.status,
      currentSubs: last?.subs_current ?? 0,
      newSubs: rows.reduce((s, r) => s + r.subs_new, 0),
      canceledSubs: rows.reduce((s, r) => s + r.subs_canceled, 0),
      revenue: rows.reduce((s, r) => s + Number(r.revenue), 0),
    }
  })

  const totals = {
    currentSubs: stats.reduce((s, a) => s + a.currentSubs, 0),
    newSubs: stats.reduce((s, a) => s + a.newSubs, 0),
    canceledSubs: stats.reduce((s, a) => s + a.canceledSubs, 0),
    revenue: stats.reduce((s, a) => s + a.revenue, 0),
  }
  return { accounts: stats, totals, periodDays: PERIOD_DAYS }
}
