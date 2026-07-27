import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de la page Compta — partagée par `loading.tsx` et le fallback `<Suspense>`
 * (guidelines-standard-feature §2.4). Composition de 2 briques génériques (`KpiSkeleton` 4
 * cartes + `RowsSkeleton`, comme `spenders-liste-skeleton.tsx`) : chacune porte déjà son
 * propre `role="status"` — pas de doublon à ajouter ici.
 */
export function ComptaSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end" aria-hidden>
        <Skeleton className="h-9 w-56" />
      </div>
      <KpiSkeleton />
      <RowsSkeleton count={6} />
    </div>
  )
}
