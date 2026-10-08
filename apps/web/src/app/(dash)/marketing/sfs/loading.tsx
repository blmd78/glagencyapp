import { RouteLoading } from '@/components/skeletons/route-loading'
import { MktDashboardSkeleton } from '@/features/marketing-dashboard/components/mkt-dashboard-skeleton'

/** La silhouette de l'onglet d'accueil (« Vue d'ensemble ») : l'écran de l'Overview. */
export default function Loading() {
  return (
    <RouteLoading title="h-7 w-32" subtitle="h-4 w-32">
      <MktDashboardSkeleton />
    </RouteLoading>
  )
}
