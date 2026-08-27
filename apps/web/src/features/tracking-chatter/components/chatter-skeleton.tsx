import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la fiche : trois cartes, dont deux rangées de six statistiques. */
export function ChatterSkeleton() {
  return (
    <div className="wrap" role="status">
      <span className="sr-only">Chargement de la fiche…</span>
      {Array.from({ length: 3 }, (_, c) => (
        <div key={c} className="card">
          <div className="blockh">
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} aria-hidden="true" className="h-14 flex-1 basis-24 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
