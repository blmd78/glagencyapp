import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette du bloc de données Overview (KPIs + graphe CA quotidien), dimensions ~
 * `OverviewTemplate` (anti-CLS) — graphe : 400 px (même hauteur que le fallback du
 * dynamic import du chart, `revenue-chart.tsx`). Source unique : importée par
 * `loading.tsx` ET le fallback `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md
 * §2 — jamais de markup de skeleton dupliqué).
 */
export function OverviewSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <Skeleton className="h-[400px] w-full" />
    </>
  )
}
