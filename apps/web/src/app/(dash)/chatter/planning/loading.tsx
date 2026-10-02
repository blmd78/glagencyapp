import { Skeleton } from '@/components/ui/skeleton'
import { RowsSkeleton } from '@/components/skeletons/rows-skeleton'

/**
 * Silhouette de l'Emploi du temps : la 1re ligne réelle de `page.tsx` (le `h1` seul, sans
 * sous-titre), le sélecteur de membre, puis les lignes du planning. Mêmes dimensions que le
 * fallback du `<Suspense>` de `page.tsx` (titre en plus, lui hors boundary) : les deux
 * silhouettes s'enchaînent sans saut visible.
 */
export default function Loading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <Skeleton aria-hidden="true" className="h-7 w-48" />
      <div aria-hidden="true" className="flex justify-end">
        <Skeleton className="h-9 w-52" />
      </div>
      <RowsSkeleton />
    </div>
  )
}
