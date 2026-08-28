import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de l'Overview, dans l'ORDRE de la page : sélecteur, bandeau de chiffres, signalements,
 * puis le tableau du roster. Skeletons nus (pas `TableSkeleton`, qui porte son propre
 * `role="status"` — il ne s'imbrique pas dans celui-ci). `withTitle={false}` quand le vrai `<h1>`
 * est déjà rendu HORS du Suspense (page.tsx) — sinon deux barres de titre se superposent pendant le
 * streaming. `loading.tsx` (route entière) garde le défaut.
 */
export function OverviewSkeleton({ withTitle = true }: { withTitle?: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        {withTitle && <Skeleton className="h-9 w-48" />}
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        {/* Bandeau de chiffres : 4 tuiles, la hauteur d'une `Figure` (libellé + valeur). */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[5.75rem] rounded-xl" />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-56" />
          <div className="overflow-hidden rounded-md border">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
