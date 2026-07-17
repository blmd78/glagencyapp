import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/**
 * Silhouette du bloc de données Social (KPIs + onglets Comptes/Liens + table), PARTAGÉE par
 * les 3 pages Instagram/Twitter/Telegram — même composition (docs/guidelines-standard-feature.md
 * §2). Le bandeau de fraîcheur (« dernier relevé ») est omis : conditionnel, dépend de la
 * donnée résolue. Source unique : importée par les 3 `loading.tsx` ET le fallback
 * `<Suspense>` des 3 `page.tsx` — jamais de markup dupliqué.
 */
export function MktSocialSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <Skeleton className="h-9 w-56" />
      <TableSkeleton rows={6} />
    </>
  )
}
