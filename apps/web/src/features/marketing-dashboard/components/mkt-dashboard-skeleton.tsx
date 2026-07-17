import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette du bloc de données Overview marketing (6 KPIs + graphe + 2 cartes), dimensions
 * ~ `MktDashboardTemplate` (anti-CLS) — graphe : ~390 px (carte + `MktDailyChart`, 280 px de
 * contenu). Source unique : importée par `loading.tsx` ET le fallback `<Suspense>` de
 * `page.tsx` (docs/guidelines-standard-feature.md §2 — jamais de markup dupliqué).
 */
export function MktDashboardSkeleton() {
  return (
    <>
      <KpiSkeleton count={6} />
      <Skeleton className="h-[390px] w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </>
  )
}
