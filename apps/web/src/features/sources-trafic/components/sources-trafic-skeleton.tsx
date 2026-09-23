import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de Sources de trafic (sélecteur + accordéons fermés) — même silhouette que
 * `infos-modeles-skeleton.tsx`, la page ayant la même anatomie. Source unique : importée par
 * `loading.tsx` ET le fallback `<Suspense>` de `page.tsx`.
 */
export function SourcesTraficSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <Skeleton className="h-8 w-44" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
