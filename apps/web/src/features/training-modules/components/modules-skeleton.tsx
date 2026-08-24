import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la liste des modules : bandeau de progression puis la grille de cartes. */
export function ModulesSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <Skeleton className="h-[86px] rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-[14px]" />
          ))}
        </div>
      </div>
    </div>
  )
}
