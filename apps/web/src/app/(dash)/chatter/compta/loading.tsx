import { Skeleton } from '@/components/ui/skeleton'
import { ComptaSkeleton } from '@/features/compta/components/compta-skeleton'

/** Silhouette de la route (préfetchable). Le vrai `h1` s'affiche dès que `page.tsx` rend. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton aria-hidden="true" className="h-8 w-40" />
      <ComptaSkeleton />
    </div>
  )
}
