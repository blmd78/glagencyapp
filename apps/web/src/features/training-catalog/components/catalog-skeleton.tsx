import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette du Catalogue : colonne modules (7 lignes) + panneau (en-tête + table). Partagée par
 *  `loading.tsx` et le fallback `<Suspense>` de la page (guidelines §2.4). */
export function CatalogSkeleton() {
  return (
    <div role="status" className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-none border-t" />
          ))}
        </div>
      </div>
    </div>
  )
}
