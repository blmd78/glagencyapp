import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette d'une rangée de cartes KPI, dimensions ~ kpi-card (anti-CLS). */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} aria-hidden="true" className="h-28" />
      ))}
    </div>
  )
}
