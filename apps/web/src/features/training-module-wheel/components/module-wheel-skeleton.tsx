import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de « Ma roue » : titre, compteur de tours, disque, bouton, liste des modules. */
export function ModuleWheelSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex flex-col items-center gap-5">
          <Skeleton className="aspect-square w-full max-w-[340px] rounded-full" />
          <Skeleton className="h-12 w-full max-w-[250px]" />
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
