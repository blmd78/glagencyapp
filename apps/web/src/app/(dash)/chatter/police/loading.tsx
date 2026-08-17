import { RouteLoading } from '@/components/skeletons/route-loading'
import { PoliceSkeleton } from '@/features/police/components/police-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-72" subtitle="h-4 w-80">
      <PoliceSkeleton />
    </RouteLoading>
  )
}
