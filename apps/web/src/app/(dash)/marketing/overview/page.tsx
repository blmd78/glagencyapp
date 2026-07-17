import { Suspense } from 'react'
import { getMktDashboard } from '@/features/marketing-dashboard/services/get-dashboard'
import { getMktStaff } from '@/features/marketing-staff/services/get-staff'
import { MktDashboardTemplate } from '@/features/marketing-dashboard/DashboardTemplate'
import { MktDashboardSkeleton } from '@/features/marketing-dashboard/components/mkt-dashboard-skeleton'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'
import { SectionFallback } from '@/components/skeletons/route-loading'
import type { MktDashboardData } from '@/features/marketing-dashboard/types'
import type { MktStaffData } from '@/features/marketing-staff/types'

// Pôle marketing : admin-only en v1 (cf. workspaces.ts).
export default async function MktDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-overview')
  const period = resolvePeriod(await searchParams)
  // Kickoff SANS await (requêtes indépendantes) : le shell (h1) s'affiche immédiatement,
  // KPIs + graphe streament dans leur boundary une fois les deux résolues.
  const data = getMktDashboard(period)
  const staff = getMktStaff(period)

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
        <MktDashboardContent data={data} staff={staff} />
      </Suspense>
    </div>
  )
}

async function MktDashboardContent({
  data,
  staff,
}: {
  data: Promise<MktDashboardData>
  staff: Promise<MktStaffData>
}) {
  const [d, s] = await Promise.all([data, staff])
  return <MktDashboardTemplate data={d} expenses={s.totalBudget} />
}
