import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du contenu Infos modèles (sélecteur de modèle + liste d'accordéons fermés) —
 * pas de brique générique adaptée (ni table ni KPI), silhouette dédiée (même raison que
 * `quotas-skeleton.tsx`). Source unique : importée par `loading.tsx` ET le fallback
 * `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2 — jamais de markup
 * de skeleton dupliqué).
 */
export function InfosModelesSkeleton() {
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
