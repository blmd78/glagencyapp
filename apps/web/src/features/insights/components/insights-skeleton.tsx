import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du bloc de données Insights (filtres + cartes), dimensions ~ `InsightsView`
 * (anti-CLS). Seul skeleton de feature SANS `TableSkeleton`/`KpiSkeleton` embarqué (pas de
 * brique générique adaptée à une liste de cartes) → il porte lui-même l'annonce a11y (même
 * pattern que `stats-skeleton.tsx`). Source unique : importée par `loading.tsx` ET le
 * fallback `<Suspense>` de `page.tsx` (`docs/guidelines-standard-feature.md` §2).
 */
export function InsightsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-16" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-44" />
        </div>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[52px] w-full" />
        ))}
      </div>
    </div>
  )
}
