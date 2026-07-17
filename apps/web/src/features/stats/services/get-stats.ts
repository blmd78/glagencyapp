import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Period } from '@/lib/period'
import type { StatsData, SubsDay } from '../types'

/**
 * Statistiques par modèle sur la période (datepicker) : nouveaux abonnés et
 * renouvellements par jour et par modèle, depuis `creator_daily`.
 * RLS : un rôle user ne reçoit que SES modèles (cloisonnement automatique).
 */
export async function getStats(period: Period): Promise<StatsData> {
  const supabase = await createClient()

  const [{ data: creators, error: creatorsErr }, { data: rows, error: rowsErr }] =
    await Promise.all([
      supabase.from('creators').select('id, name'),
      // Table journalière : fetchAll (pagination PostgREST, tri = PK).
      fetchAll((f, t) =>
        supabase
          .from('creator_daily')
          .select('creator_id, date, new_subs, renew_subs')
          .gte('date', period.from)
          .lte('date', period.to)
          .order('creator_id')
          .order('date')
          .range(f, t),
      ),
    ])
  if (creatorsErr) throw new Error(creatorsErr.message)
  if (rowsErr) throw new Error(rowsErr.message)

  const nameById = new Map((creators ?? []).map((c) => [c.id, c.name]))

  // Grille jour × modèle (jours triés, gaps de dates non comblés : pas de donnée = pas de jour).
  const byDay = new Map<string, SubsDay>()
  const totalByModel = new Map<string, number>()
  let totalNew = 0
  let totalRenew = 0
  for (const r of rows ?? []) {
    const name = nameById.get(r.creator_id)
    if (!name) continue
    const day = byDay.get(r.date) ?? { date: r.date, subs: {}, renews: {} }
    if ((r.new_subs ?? 0) > 0) {
      day.subs[name] = (day.subs[name] ?? 0) + (r.new_subs ?? 0)
      totalByModel.set(name, (totalByModel.get(name) ?? 0) + (r.new_subs ?? 0))
    }
    if ((r.renew_subs ?? 0) > 0) day.renews[name] = (day.renews[name] ?? 0) + (r.renew_subs ?? 0)
    totalNew += r.new_subs ?? 0
    totalRenew += r.renew_subs ?? 0
    byDay.set(r.date, day)
  }

  return {
    period: period.label,
    models: [...totalByModel.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total),
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totalNew,
    totalRenew,
  }
}
