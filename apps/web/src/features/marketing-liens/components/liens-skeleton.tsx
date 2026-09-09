import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette du bloc de données Liens (KPIs + répartition par source + sélecteur de critère
 * + sections), dimensions ~ `LiensView` (anti-CLS). Source unique : importée par
 * `loading.tsx` ET le fallback `<Suspense>` de `page.tsx`
 * (docs/guidelines-standard-feature.md §2 — jamais de markup dupliqué).
 */
export function MktLiensSkeleton() {
  return (
    <>
      <KpiSkeleton />
      {/* Même ordre que LiensView : le sélecteur de critère AVANT la barre qu'il pilote. */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="ml-auto h-9 w-56" />
      </div>
      <Skeleton className="h-[104px] w-full" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[180px] w-full" />
        ))}
      </div>
    </>
  )
}
