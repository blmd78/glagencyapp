import { Skeleton } from '@/components/ui/skeleton'

/**
 * Fallback de chargement d'une page du dash : titre + rangée de KPIs + bloc tableau.
 * Silhouette générique volontairement neutre (pas de skeleton sur-mesure par page).
 */
export function PageSkeleton({ kpis = 4 }: { kpis?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {kpis > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: kpis }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
      <Skeleton className="h-96" />
    </div>
  )
}
