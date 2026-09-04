import { RouteLoading } from '@/components/skeletons/route-loading'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/** Silhouette de la fiche d'activité : retour, nom, quatre tuiles, historique de couverture. */
export default function Loading() {
  return (
    <RouteLoading title="h-8 w-64" subtitle="h-4 w-80">
      <KpiSkeleton />
      <TableSkeleton rows={6} />
    </RouteLoading>
  )
}
