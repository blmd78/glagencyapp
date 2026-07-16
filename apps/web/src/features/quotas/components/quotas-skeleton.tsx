import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du bloc Quotas (tableau des seuils + liste des exclusions), dimensions ~
 * `QuotasEditor`/`ExclusionsEditor` (anti-CLS) — pas de toolbar ici contrairement à
 * `TableSkeleton` (le tableau des seuils n'a pas de filtre), donc silhouette dédiée plutôt
 * que la brique générique. Source unique : importée par `loading.tsx` ET le fallback
 * `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2 — jamais de markup de
 * skeleton dupliqué). Seul skeleton de la page (aucun KpiSkeleton/TableSkeleton embarqué) →
 * il porte lui-même l'annonce a11y.
 */
export function QuotasSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="overflow-hidden rounded-xl border">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-72" />
        <div className="overflow-hidden rounded-xl border">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-none border-t first:border-t-0" />
          ))}
        </div>
      </div>
    </div>
  )
}
