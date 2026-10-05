import { RouteLoading } from '@/components/skeletons/route-loading'
import { TraficSkeleton } from '@/features/marketing-trafic/components/trafic-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-24">
      <TraficSkeleton />
    </RouteLoading>
  )
}
