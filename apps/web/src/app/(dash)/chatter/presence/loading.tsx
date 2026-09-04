import { RouteLoading } from '@/components/skeletons/route-loading'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/** Silhouette du relevé d’équipe : filtres, quatre tuiles, cartes par modèle. */
export default function Loading() {
  return (
    <RouteLoading title="h-8 w-56" subtitle="h-9 w-[29rem]">
      <KpiSkeleton />
      <TableSkeleton />
    </RouteLoading>
  )
}
