import { Skeleton } from '@/components/ui/skeleton'
import { MktLiensSkeleton } from '@/features/marketing-liens/components/liens-skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <MktLiensSkeleton />
    </div>
  )
}
