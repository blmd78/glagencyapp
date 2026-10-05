import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/**
 * Silhouette de la page Membres — barre d'onglets PUIS contenu.
 *
 * Composant dédié parce que la page a plusieurs onglets (trois depuis 0101, quatre pour un admin) : un `TableSkeleton` nu
 * laissait la `TabsList` apparaître d'un coup à l'arrivée des données, en poussant tout le
 * contenu vers le bas (CLS). Consommé par `loading.tsx` ET par le fallback `<Suspense>` de
 * `page.tsx` — jamais dupliqué byte-à-byte entre les deux (guidelines-standard-feature §2.4).
 *
 * `tabs` = nombre d'onglets réellement visibles par le lecteur (un admin en voit 4, un manager 2) :
 * le fallback `<Suspense>` de `page.tsx` connaît le rôle et le passe ; `loading.tsx` ne le connaît
 * pas et garde le défaut.
 *
 * L'a11y (`role="status"` + `sr-only`) est portée par les briques génériques et par
 * `RouteLoading` : ne pas la redupliquer ici.
 */
export function MembersSkeleton({ tabs = 3 }: { tabs?: number }) {
  return (
    <div className="flex flex-col gap-6">
      {/* Un bloc par onglet visible (« Comptes », « Turnover », puis « Activité » et « Fiches MyPuls » pour un admin). */}
      <div className="flex gap-1.5">
        {Array.from({ length: tabs }, (_, i) => (
          <Skeleton key={i} aria-hidden="true" className="h-9 w-24 rounded-md" />
        ))}
      </div>
      <TableSkeleton />
    </div>
  )
}
