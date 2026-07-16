import { Skeleton } from '@/components/ui/skeleton'

/** Silhouette d'une table du dash (toolbar + header + lignes), dimensions ~ contenu final (anti-CLS). */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
          ))}
        </div>
      </div>
    </div>
  )
}
