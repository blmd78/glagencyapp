import { RouteLoading } from '@/components/skeletons/route-loading'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/** Silhouette du détail des vacations : titre, barre de filtres, tableaux par jour. */
export default function Loading() {
  return (
    <RouteLoading title="h-8 w-64" subtitle="h-9 w-[42rem]">
      <TableSkeleton />
    </RouteLoading>
  )
}
