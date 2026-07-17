import { RouteLoading } from '@/components/skeletons/route-loading'
import { MktLiensSkeleton } from '@/features/marketing-liens/components/liens-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-56" subtitle="h-4 w-32">
      <MktLiensSkeleton />
    </RouteLoading>
  )
}
