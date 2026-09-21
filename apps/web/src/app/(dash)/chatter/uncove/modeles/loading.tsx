import { RouteLoading } from '@/components/skeletons/route-loading'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <TableSkeleton />
    </RouteLoading>
  )
}
