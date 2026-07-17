import { RouteLoading } from '@/components/skeletons/route-loading'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-20" subtitle="h-4 w-96">
      <TableSkeleton />
    </RouteLoading>
  )
}
