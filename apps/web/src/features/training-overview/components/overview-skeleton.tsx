import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de l'Overview, dans l'ORDRE de la page : cartes de coût IA, décompte, signalements, sélecteur,
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
        {/* Bandeau de coût IA : 4 cartes aux dimensions de `KpiCard` (anti-CLS). Skeletons nus —
            `KpiSkeleton` porte son propre `role="status"`, il ne s'imbrique pas dans celui-ci. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-4 w-56" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-9 w-full sm:max-w-xs" />
        <div className="flex flex-col gap-3">
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
