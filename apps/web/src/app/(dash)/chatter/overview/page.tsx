import { getOverview } from '@/features/overview/services/get-overview'
import { requireAccess } from '@/lib/auth'
import { OverviewTemplate } from '@/features/overview/OverviewTemplate'
import { resolvePeriod } from '@/lib/period'

// La page résout la période (datepicker du header) et la passe au service.
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const profile = await requireAccess('overview')
  const period = resolvePeriod(await searchParams)
  const data = await getOverview(period, { restricted: profile.role !== 'admin' })
  return <OverviewTemplate data={data} />
}
