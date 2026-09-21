import { RouteLoading } from '@/components/skeletons/route-loading'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

export default function Loading() {
  return (
    <RouteLoading>
      <div className="flex flex-col gap-6">
        <KpiSkeleton count={4} />
        <TableSkeleton />
      </div>
    </RouteLoading>
  )
}
