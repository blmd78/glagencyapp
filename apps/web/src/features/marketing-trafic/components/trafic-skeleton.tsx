import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/** Silhouette de Marketing › Trafic (KPIs, courbe, onglets, table) — partagée par loading.tsx et le Suspense. */
export function TraficSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <Skeleton className="h-[260px] w-full" />
      <Skeleton className="h-9 w-64" />
      <TableSkeleton rows={8} />
    </>
  )
}
