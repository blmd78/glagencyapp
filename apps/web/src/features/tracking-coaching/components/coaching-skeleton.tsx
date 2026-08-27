import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la liste : la barre d'outils, puis les lignes. */
export function CoachingSkeleton() {
  return (
    <div className="wrap" role="status">
      <span className="sr-only">Chargement du suivi…</span>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="flex flex-col gap-px">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} aria-hidden="true" className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

/** Silhouette de la fiche : l'en-tête chiffré, puis trois cartes. */
export function ChatterFileSkeleton() {
  return (
    <div className="wrap" role="status">
      <span className="sr-only">Chargement de la fiche…</span>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} aria-hidden="true" className="h-20 flex-1 basis-40 rounded-xl" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} aria-hidden="true" className="h-40 w-full rounded-xl" />
      ))}
    </div>
  )
}
