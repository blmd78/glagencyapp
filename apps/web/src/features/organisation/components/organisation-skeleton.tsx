import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de l'orga : sous-titre + 3 sections (titre + tableau). */
export function OrganisationSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-8">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-8">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
