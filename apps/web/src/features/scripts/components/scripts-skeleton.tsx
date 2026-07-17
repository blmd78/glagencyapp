import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette PLEINE PAGE de Scripts — INCLUT le bloc titre + la barre recherche/sélecteur
 * de modèle (même raison que `repos-skeleton.tsx`) : le sélecteur (`ScriptsView`) est un
 * widget client (useRouter) qui a besoin de `data.creators`/`data.creatorId` — titre et
 * sélecteur vivent sur la MÊME zone, donc pas de h1 « immédiat » séparable dans `page.tsx`
 * sans casser la mise en page (docs/guidelines-data-loading.md §3, « widget d'en-tête
 * couplé à un hook »). Le bouton « Ajouter un item » (admin uniquement) est OMIS — même
 * choix que `planning-skeleton.tsx` : le rôle n'est pas connu de `loading.tsx`, et ce
 * composant est la source UNIQUE partagée avec le fallback `<Suspense>` de `page.tsx`
 * (docs/guidelines-standard-feature.md §2).
 */
export function ScriptsSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-52" />
      </div>
      <div aria-hidden="true" className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
