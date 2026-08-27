import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la page Managers : la barre « en ligne », puis la grille. */
export function ManagersSkeleton() {
  return (
    <div className="wrap" role="status">
      <span className="sr-only">Chargement des managers…</span>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} aria-hidden="true" className="h-8 w-36 rounded-full" />
        ))}
      </div>
      <div className="card">
        <div className="blockh">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex flex-col gap-px">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} aria-hidden="true" className="h-11 w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  )
}
