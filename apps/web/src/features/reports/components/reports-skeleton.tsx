import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette de la page Dashboard (form + 2 cartes) — partagée par `loading.tsx` et le
 *  fallback `<Suspense>` de la page (docs/guidelines-standard-feature.md §2). */
export function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-40 w-full rounded-xl" aria-hidden />
      <Skeleton className="h-28 w-full rounded-xl" aria-hidden />
      <Skeleton className="h-28 w-full rounded-xl" aria-hidden />
    </div>
  )
}
