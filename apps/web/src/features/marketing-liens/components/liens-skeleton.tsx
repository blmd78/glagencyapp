import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/**
 * Silhouette du bloc de données Liens (KPIs + onglets par type + table), dimensions ~
 * `MktLiensTemplate` (anti-CLS) — barre d'onglets : `h-9` (même hauteur que `TabsList`).
 * Source unique : importée par `loading.tsx` ET le fallback `<Suspense>` de `page.tsx`
 * (docs/guidelines-standard-feature.md §2 — jamais de markup dupliqué).
 */
export function MktLiensSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <Skeleton className="h-9 w-80" />
      <TableSkeleton />
    </>
  )
}
