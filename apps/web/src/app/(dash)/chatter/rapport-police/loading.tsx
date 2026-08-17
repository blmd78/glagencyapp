import { RouteLoading } from '@/components/skeletons/route-loading'
import { PoliceReportsSkeleton } from '@/features/police-reports/components/reports-skeleton'

export default function Loading() {
  return (
    <RouteLoading title="h-7 w-56" subtitle="h-4 w-80">
      <PoliceReportsSkeleton />
    </RouteLoading>
  )
}
