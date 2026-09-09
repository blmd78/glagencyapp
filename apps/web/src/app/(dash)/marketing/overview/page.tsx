import { Suspense } from 'react'
import { getMktDashboard } from '@/features/marketing-dashboard/services/get-dashboard'
import { MktDashboardTemplate } from '@/features/marketing-dashboard/DashboardTemplate'
import { MktDashboardSkeleton } from '@/features/marketing-dashboard/components/mkt-dashboard-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktDashboardData } from '@/features/marketing-dashboard/types'

// Pôle marketing : admin-only en v1 (cf. workspaces.ts).
export default async function MktDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-overview')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await : le shell (h1) s'affiche immédiatement, KPIs + graphe streament
  // dans leur boundary une fois la lecture résolue. La lecture du staff a disparu avec les
  // KPI Dépenses / Bénéfice net (cf. DashboardTemplate) — une requête de moins par rendu.
  const data = getMktDashboard(period)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <Suspense
        fallback={
          <SectionFallback>
            <MktDashboardSkeleton />
          </SectionFallback>
        }
      >
        <MktDashboardContent data={data} />
      </Suspense>
    </div>
  )
}

async function MktDashboardContent({ data }: { data: Promise<MktDashboardData> }) {
  return <MktDashboardTemplate data={await data} />
}
