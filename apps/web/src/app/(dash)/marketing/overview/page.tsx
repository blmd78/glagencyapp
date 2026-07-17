import { getMktDashboard } from '@/features/marketing-dashboard/services/get-dashboard'
import { getMktStaff } from '@/features/marketing-staff/services/get-staff'
import { MktDashboardTemplate } from '@/features/marketing-dashboard/DashboardTemplate'
import { requireAccess } from '@/lib/auth'
import { resolvePeriod } from '@/lib/period'

// Pôle marketing : admin-only en v1 (cf. workspaces.ts).
export default async function MktDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  await requireAccess('mkt-overview')
  const period = resolvePeriod(await searchParams)
  const [data, staff] = await Promise.all([getMktDashboard(period), getMktStaff(period)])
  return <MktDashboardTemplate data={data} expenses={staff.totalBudget} />
}
