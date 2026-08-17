import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la liste des modules : grille de cartes (7 dans le seed). */
export function ModulesSkeleton() {
  return (
    <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} aria-hidden="true" className="h-32 rounded-xl" />
      ))}
    </div>
  )
}
