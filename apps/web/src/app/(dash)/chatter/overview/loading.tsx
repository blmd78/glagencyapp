import { RouteLoading } from '@/components/skeletons/route-loading'
import { OverviewSkeleton } from '@/features/overview/components/overview-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <OverviewSkeleton />
    </RouteLoading>
  )
}
