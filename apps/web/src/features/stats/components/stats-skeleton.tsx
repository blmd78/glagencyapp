import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du bloc de données Stats (carte graphe abonnés), dimensions ~
 * `SubsChart` (anti-CLS) — même hauteur que le fallback du dynamic import du chart
 * (`subs-chart.tsx`, `h-[452px]`) : silhouette identique que la donnée serveur soit
 * encore en vol ou que ce soit le bundle recharts côté client qui charge. Source
 * unique : importée par `loading.tsx` ET le fallback `<Suspense>` de `page.tsx`
 * (docs/guidelines-standard-feature.md §2 — jamais de markup de skeleton dupliqué).
 */
export function StatsSkeleton() {
  // Seul skeleton de feature SANS KpiSkeleton embarqué → il porte lui-même l'annonce
  // a11y (les autres l'héritent du role="status" de KpiSkeleton).
  return (
    <div role="status">
      <span className="sr-only">Chargement…</span>
      <Skeleton aria-hidden="true" className="h-[452px] w-full" />
    </div>
  )
}
