import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de Ma formation : l'en-tête de jeu, le bandeau d'objectif, puis les deux colonnes
 * (modules à gauche ; podium et trophées à droite) — mêmes dimensions que le contenu réel,
 * anti-CLS. Plus d'onglets depuis la reprise de la structure GLA.
 *
 * `withTitle={false}` quand le vrai `<h1>` est déjà rendu HORS du Suspense (page.tsx) — sinon deux
 * barres de titre se superposent pendant le streaming. `loading.tsx` (route entière, aucun titre à
 * l'écran) garde le défaut.
 */
export function MeSkeleton({ withTitle = true }: { withTitle?: boolean }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-4">
        {withTitle && <Skeleton className="h-9 w-48" />}
        <Skeleton className="h-[152px] rounded-[20px] sm:h-[136px]" />
        <Skeleton className="h-[74px] rounded-2xl" />
        <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Skeleton className="h-[420px] rounded-[18px]" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-[260px] rounded-[18px]" />
            <Skeleton className="h-[180px] rounded-[18px]" />
          </div>
        </div>
      </div>
    </div>
  )
}
