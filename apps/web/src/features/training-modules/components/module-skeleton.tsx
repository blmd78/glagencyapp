import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la page module : onglets + colonne de texte (cours) — même largeur `max-w-prose`. */
export function ModuleSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <Skeleton className="h-9 w-40" />
        <div className="flex max-w-prose flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
