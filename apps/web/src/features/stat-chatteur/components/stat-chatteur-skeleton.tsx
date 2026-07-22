import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/**
 * Silhouette du bloc de données Stat chatteur (4 KPI + classement), dimensions ~
 * `StatChatteurTemplate` (anti-CLS). Source unique : importée par `loading.tsx` ET le
 * fallback `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2).
 */
export function StatChatteurSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <TableSkeleton />
    </>
  )
}
