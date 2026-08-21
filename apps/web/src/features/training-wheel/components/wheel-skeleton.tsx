import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de la Roue : titre, sous-titre, le disque, le bouton, puis la table des gains.
 * Le `<h1>` dépend de la config (titre configurable) : il est DANS le Suspense, donc le squelette
 * le porte toujours — pas de variante `withTitle` ici, contrairement à Ma formation.
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
        <div className="flex flex-col items-center gap-5">
          <Skeleton className="aspect-square w-full max-w-[340px] rounded-full" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-40" />
        </div>
      </div>
    </div>
  )
}
