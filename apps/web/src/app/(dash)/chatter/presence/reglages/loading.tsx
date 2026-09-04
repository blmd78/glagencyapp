import { RouteLoading } from '@/components/skeletons/route-loading'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/** Silhouette des réglages : titre, trois champs, puis les tableaux. */
export default function Loading() {
  return (
    <RouteLoading title="h-8 w-64" subtitle="h-4 w-96">
      <TableSkeleton />
    </RouteLoading>
  )
}
