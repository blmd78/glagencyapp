import { Skeleton } from '@/components/ui/skeleton'
import { ReportsSkeleton } from '@/features/reports/components/reports-skeleton'

// Silhouette de la route (préfetchable). Le vrai h1 s'affiche dès que page.tsx rend.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <ReportsSkeleton />
    </div>
  )
}
