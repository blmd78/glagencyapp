import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette du To-Do : sept colonnes, puis la rangée du bas. */
export function TodoSkeleton() {
  return (
    <div className="wrap wide" role="status">
      <span className="sr-only">Chargement de la semaine…</span>
      <div className="week">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} aria-hidden="true" className="h-44 w-full rounded-xl" />
        ))}
      </div>
      <div className="botrow">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
