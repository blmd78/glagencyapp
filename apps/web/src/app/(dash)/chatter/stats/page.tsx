import { Suspense } from 'react'
import { getStats } from '@/features/stats/services/get-stats'
import { StatsTemplate } from '@/features/stats/StatsTemplate'
import { StatsSkeleton } from '@/features/stats/components/stats-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { Skeleton } from '@/components/ui/skeleton'
import type { StatsData } from '@/features/stats/types'

// Statistiques par modèle — pilotées par le datepicker (droit `stats` accordable).
export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('stats')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le graphe streame
  // dans son boundary quand le fetchAll répond.
  const data = getStats(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <Skeleton className="-mt-4 h-4 w-72" />
            <StatsSkeleton />
          </div>
        }
      >
        <StatsContent data={data} />
      </Suspense>
    </div>
  )
}

async function StatsContent({ data }: { data: Promise<StatsData> }) {
  return <StatsTemplate data={await data} />
}
