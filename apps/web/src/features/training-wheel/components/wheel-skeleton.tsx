import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de la Roue (page encadrant) : titre, sous-titre, onglets, sélecteur de chatteur,
 * disque et bouton. Le `<h1>` dépend de la config (titre configurable) : il est DANS le Suspense,
 * donc le squelette le porte toujours — pas de variante `withTitle`, contrairement à Ma formation.
 */
export function WheelSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-56" />
        <div className="flex flex-col items-center gap-5">
          <Skeleton className="h-16 w-full max-w-sm" />
          <Skeleton className="aspect-square w-full max-w-[340px] rounded-full" />
          <Skeleton className="h-9 w-56" />
        </div>
      </div>
    </div>
  )
}
