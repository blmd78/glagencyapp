import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette du bloc de données Modèles (KPIs + les deux donuts + la courbe + les bandes),
 * dimensions ~ `MktModelesTemplate` (anti-CLS). Source unique : importée par `loading.tsx`
 * ET le fallback `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2).
 */
export function MktModelesSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[260px] w-full" />
        <Skeleton className="h-[260px] w-full" />
      </div>
      <Skeleton className="h-[240px] w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] w-full" />
        ))}
      </div>
    </>
  )
}
