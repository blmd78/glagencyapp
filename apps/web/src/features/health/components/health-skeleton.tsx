import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette du bloc de données Santé (jauge + KPIs + cartes modèles), dimensions ~
 * `HealthTemplate` (anti-CLS) — jauge `size="lg"` = 180×112 dans sa carte (`ltv-gauge.tsx`).
 * Source unique : importée par `loading.tsx` ET le fallback `<Suspense>` de `page.tsx`
 * (docs/guidelines-standard-feature.md §2 — jamais de markup de skeleton dupliqué).
 */
export function HealthSkeleton() {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Skeleton className="h-28 w-56" />
        <KpiSkeleton />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </>
  )
}
