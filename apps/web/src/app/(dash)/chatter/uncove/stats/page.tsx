import { Suspense } from 'react'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { getUncoveDashboard } from '@/features/uncove/services/get-uncove-dashboard'
import { UncoveDashboard } from '@/features/uncove/components/uncove-dashboard'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import type { UncoveDashboardData } from '@/features/uncove/types'

// Uncove › Stats — Subs + CA par compte sur la PÉRIODE du header (`?from=&to=`).
export default async function UncoveStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('uncove')
  const period = resolvePeriod(await searchParams)
  const data = getUncoveDashboard(period) // pas d'await : le shell s'affiche, le contenu streame

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Uncove — Stats</h1>
      {/* Clé = période : le squelette réapparaît quand on change la plage au header. */}
      <Suspense
        key={`${period.from}-${period.to}`}
        fallback={
          <div className="flex flex-col gap-6">
            <KpiSkeleton count={4} />
            <TableSkeleton />
          </div>
        }
      >
        <StatsContent data={data} />
      </Suspense>
    </div>
  )
}

async function StatsContent({ data }: { data: Promise<UncoveDashboardData> }) {
  return <UncoveDashboard data={await data} />
}
