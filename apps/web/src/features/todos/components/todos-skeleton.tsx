import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la to-do — fallback du Suspense quand ?vue=todo (page.tsx). */
export function TodosSkeleton() {
  return (
    // role="status" + sr-only : convention des skeletons du repo (planning-skeleton.tsx).
    <div role="status">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  )
}
