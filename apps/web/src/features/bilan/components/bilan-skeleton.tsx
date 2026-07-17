import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette PLEINE PAGE du Bilan hebdomadaire — INCLUT le bloc titre + le sélecteur de
 * semaine, contrairement aux autres skeletons de feature (santé, overview) : le header
 * (`WeekSwitcher`) est un widget client (useRouter/useSearchParams) qui a besoin de
 * `data.weeks`/`data.week` pour s'afficher — titre et sélecteur vivent sur la MÊME ligne,
 * donc pas de h1 « immédiat » séparable dans `page.tsx` sans casser la mise en page
 * (docs/guidelines-data-loading.md §3, « widget d'en-tête couplé à un hook — garde tout
 * l'en-tête dans la View »). Source unique, importée par `loading.tsx` ET le fallback
 * `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2).
 */
export function BilanSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="ml-auto">
          <Skeleton className="h-9 w-56" />
        </div>
      </div>
      {/* a11y (role="status" + sr-only) déjà portée par KpiSkeleton — pas de doublon ici. */}
      <KpiSkeleton />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  )
}
