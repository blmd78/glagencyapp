import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de l'orga — mêmes dimensions que le rendu final (anti-CLS, guidelines §2) :
 *  la grille de 4 cartes KPI puis LE tableau unique. */
export function OrganisationSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[8.5rem] w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[28rem] w-full rounded-xl" />
      </div>
    </div>
  )
}
