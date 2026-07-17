import { Skeleton } from '@/components/ui/skeleton'
import { InsightsSkeleton } from '@/features/insights/components/insights-skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />
      <InsightsSkeleton />
    </div>
  )
}
