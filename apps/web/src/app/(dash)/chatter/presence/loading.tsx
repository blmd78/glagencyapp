import { RouteLoading } from '@/components/skeletons/route-loading'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/** Silhouette du relevé d’équipe : filtres (créneau + deux bascules), quatre tuiles, cartes. */
export default function Loading() {
  return (
    <RouteLoading title="h-8 w-56" subtitle="h-9 w-[26rem]">
      <KpiSkeleton />
      <TableSkeleton />
    </RouteLoading>
  )
}
