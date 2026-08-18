import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de Ma formation : titre, 4 chiffres, onglets, trois cartes de module.
 * `withTitle={false}` quand le vrai `<h1>` est déjà rendu HORS du Suspense (page.tsx) —
 * sinon deux barres de titre se superposent pendant le streaming. `loading.tsx` (route
 * entière, aucun titre à l'écran) garde le défaut.
 */
export function MeSkeleton({ withTitle = true }: { withTitle?: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        {withTitle && <Skeleton className="h-9 w-48" />}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-9 w-72" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    </div>
  )
}
