import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette du récap : la barre de totaux, puis deux paliers de cartes. */
export function RecapSkeleton() {
  return (
    <div className="wrap wide" role="status">
      <span className="sr-only">Chargement du récap…</span>
      <Skeleton className="h-12 w-full rounded-xl" />
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-56" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} aria-hidden="true" className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  )
}
