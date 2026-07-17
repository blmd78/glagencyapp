import { Suspense } from 'react'
import { getOverview } from '@/features/overview/services/get-overview'
import { requireAccess } from '@/lib/auth'
import { OverviewTemplate } from '@/features/overview/OverviewTemplate'
import { OverviewSkeleton } from '@/features/overview/components/overview-skeleton'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { OverviewData } from '@/features/overview/types'

// La page résout la période (datepicker du header) et la passe au service.
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('overview')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, le bloc de données
  // (KPIs + graphe) streame dans son boundary quand le RPC répond.
  const data = getOverview(period, { restricted: profile.role !== 'admin' })

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <OverviewSkeleton />
          </SectionFallback>
        }
      >
        <OverviewContent data={data} />
      </Suspense>
    </div>
  )
}

async function OverviewContent({ data }: { data: Promise<OverviewData> }) {
  return <OverviewTemplate data={await data} />
}
