import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de la page « Rapport du soir » (titre + formulaire de saisie) — source unique,
 * importée par `loading.tsx` ET le fallback `<Suspense>` de `page.tsx`
 * (docs/guidelines-standard-feature.md §2). a11y : `role="status"` + `sr-only`.
 */
export function PoliceReportsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Chargement…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" aria-hidden />
        <Skeleton className="h-4 w-80" aria-hidden />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" aria-hidden />
    </div>
  )
}
