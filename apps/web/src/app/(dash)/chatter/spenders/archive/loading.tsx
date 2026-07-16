import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-72" />
      </div>
      <TableSkeleton />
    </div>
  )
}
