import { RouteLoading } from '@/components/skeletons/route-loading'
import { StatsSkeleton } from '@/features/stats/components/stats-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <StatsSkeleton />
    </RouteLoading>
  )
}
