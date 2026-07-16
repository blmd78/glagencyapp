import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette PLEINE PAGE du Planning des repos — INCLUT le bloc titre + le sélecteur de
 * semaine (même raison que `bilan-skeleton.tsx`) : le sélecteur (`ReposView`) est un widget
 * client (useRouter/useSearchParams) qui a besoin de `data.weeks`/`data.weekStart` — titre et
 * sélecteur vivent sur la MÊME ligne, donc pas de h1 « immédiat » séparable dans `page.tsx`
 * sans casser la mise en page (docs/guidelines-data-loading.md §3, « widget d'en-tête couplé
 * à un hook — garde tout l'en-tête dans la View »). Source unique, importée par `loading.tsx`
 * ET le fallback `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2).
 */
export function ReposSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="ml-auto">
          <Skeleton className="h-9 w-64" />
        </div>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border">
          <Skeleton className="h-16 w-full rounded-none" />
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-none border-t" />
          ))}
        </div>
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-5 w-64" />
      </div>
    </div>
  )
}
