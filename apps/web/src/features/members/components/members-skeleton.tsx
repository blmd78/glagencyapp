import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/**
 * Silhouette de la page Membres — barre d'onglets PUIS contenu.
 *
 * Composant dédié parce que la page a trois onglets depuis 0103/0104 : un `TableSkeleton` nu
 * laissait la `TabsList` apparaître d'un coup à l'arrivée des données, en poussant tout le
 * contenu vers le bas (CLS). Consommé par `loading.tsx` ET par le fallback `<Suspense>` de
 * `page.tsx` — jamais dupliqué byte-à-byte entre les deux (guidelines-standard-feature §2.4).
 *
 * L'a11y (`role="status"` + `sr-only`) est portée par les briques génériques et par
 * `RouteLoading` : ne pas la redupliquer ici.
 */
export function MembersSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Trois onglets, aux largeurs de « Comptes », « Turnover » et « Activité ». */}
      <div className="flex gap-1.5">
        <Skeleton aria-hidden="true" className="h-9 w-24 rounded-md" />
        <Skeleton aria-hidden="true" className="h-9 w-24 rounded-md" />
        <Skeleton aria-hidden="true" className="h-9 w-24 rounded-md" />
      </div>
      <TableSkeleton />
    </div>
  )
}
