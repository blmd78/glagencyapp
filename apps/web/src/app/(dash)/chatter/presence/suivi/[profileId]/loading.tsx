import { RouteLoading } from '@/components/skeletons/route-loading'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-6 w-32" subtitle="h-4 w-56">
      <RowsSkeleton />
    </RouteLoading>
  )
}
