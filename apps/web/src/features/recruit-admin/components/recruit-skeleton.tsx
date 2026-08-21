import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouettes des deux pages du recrutement. Partagées par `loading.tsx` (route) et le fallback
 * `<Suspense>` des pages (guidelines §2.4) — jamais de markup de skeleton dupliqué entre les deux.
 * A11y portée une fois par le conteneur (`role="status"`), squelettes `aria-hidden`.
 */
export function RecruitSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-52" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-none border-t" />
          ))}
        </div>
      </div>
    </div>
  )
}

export function ConfigSkeleton() {
  return (
    <div role="status" className="flex max-w-3xl flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  )
}
