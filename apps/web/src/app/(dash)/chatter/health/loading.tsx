import { RouteLoading } from '@/components/skeletons/route-loading'
import { HealthSkeleton } from '@/features/health/components/health-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <HealthSkeleton />
    </RouteLoading>
  )
}
