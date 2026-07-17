import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette PLEINE PAGE de Police — INCLUT le bloc titre + le sélecteur de jour (même
 * raison que `scripts-skeleton.tsx`/`planning-skeleton.tsx`/`bilan-skeleton.tsx`) : le
 * sélecteur (`PoliceView`) est un widget client (useRouter) qui a besoin de
 * `data.day`/`data.days` — titre et sélecteur vivent sur la MÊME zone, pas de h1
 * « immédiat » séparable dans `page.tsx` sans casser la mise en page
 * (docs/guidelines-data-loading.md §3, « widget d'en-tête couplé à un hook »). Source
 * unique : importée par `loading.tsx` ET le fallback `<Suspense>` de `page.tsx`
 * (docs/guidelines-standard-feature.md §2 — jamais de markup de skeleton dupliqué).
 */
export function PoliceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="ml-auto">
          <Skeleton className="h-9 w-56" />
        </div>
      </div>
      {/* a11y (role="status" + sr-only) déjà portée par KpiSkeleton — pas de doublon ici. */}
      <KpiSkeleton count={3} />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
