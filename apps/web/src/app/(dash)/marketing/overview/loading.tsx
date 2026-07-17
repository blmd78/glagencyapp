import { RouteLoading } from '@/components/skeletons/route-loading'
import { MktDashboardSkeleton } from '@/features/marketing-dashboard/components/mkt-dashboard-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-32">
      <MktDashboardSkeleton />
    </RouteLoading>
  )
}
