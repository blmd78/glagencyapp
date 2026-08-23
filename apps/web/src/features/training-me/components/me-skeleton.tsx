import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de Ma formation : l'en-tête de jeu (badge de rang + barre d'XP), le bandeau d'objectif,
 * les onglets, puis les deux colonnes (modules / podium + trophées) — mêmes dimensions que le
 * contenu réel, anti-CLS.
 *
 * `withTitle={false}` quand le vrai `<h1>` est déjà rendu HORS du Suspense (page.tsx) — sinon deux
 * barres de titre se superposent pendant le streaming. `loading.tsx` (route entière, aucun titre à
 * l'écran) garde le défaut.
 */
export function MeSkeleton({ withTitle = true }: { withTitle?: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        {withTitle && <Skeleton className="h-9 w-48" />}
        <Skeleton className="h-[152px] sm:h-[136px]" />
        <Skeleton className="h-[76px]" />
        <Skeleton className="h-9 w-72" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-40" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
          <div className="flex flex-col gap-6">
            <Skeleton className="h-52" />
            <Skeleton className="h-44" />
          </div>
        </div>
      </div>
    </div>
  )
}
