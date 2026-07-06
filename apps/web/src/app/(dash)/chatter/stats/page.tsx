import { getStats } from '@/features/stats/services/get-stats'
import { StatsTemplate } from '@/features/stats/StatsTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

// Statistiques par modèle — pilotées par le datepicker (droit `stats` accordable).
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('stats')
  const period = resolvePeriod(await searchParams)
  const data = await getStats(period)
  return <StatsTemplate data={data} />
}
