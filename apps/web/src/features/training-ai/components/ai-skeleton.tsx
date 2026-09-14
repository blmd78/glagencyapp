import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/** Silhouette de la page Analytics IA (KPIs + graphe + deux tables), dimensions ~ `AiTemplate`. */
export function AiSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <Skeleton className="h-[340px] w-full" />
      <Skeleton className="h-[220px] w-full" />
      <Skeleton className="h-[420px] w-full" />
    </>
  )
}
