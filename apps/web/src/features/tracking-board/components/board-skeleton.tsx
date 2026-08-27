import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du board pendant le chargement : la barre « en ligne » puis deux groupes de lignes.
 * Dimensions calées sur le rendu final — un squelette plus court ferait sauter la page à l'arrivée
 * des données, sur un écran qu'on ouvre dix fois par jour.
 */
export function BoardSkeleton() {
  return (
    <div className="wrap" role="status">
      <span className="sr-only">Chargement du board…</span>
      <div className="card">
        <div className="blockh">
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="cardpad flex flex-wrap gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} aria-hidden="true" className="h-8 w-40 rounded-full" />
          ))}
        </div>
      </div>
      {Array.from({ length: 2 }, (_, g) => (
        <div key={g} className="card">
          <div className="blockh">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex flex-col gap-px">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} aria-hidden="true" className="h-11 w-full rounded-none" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
