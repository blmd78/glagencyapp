import { RouteLoading } from '@/components/skeletons/route-loading'
import { QuotasSkeleton } from '@/features/quotas/components/quotas-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <QuotasSkeleton />
    </RouteLoading>
  )
}
