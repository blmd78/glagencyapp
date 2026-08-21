import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la page session : titre, consigne, fil de messages, composer. */
export function SessionSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  )
}
