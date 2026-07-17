import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette PLEINE PAGE du planning journalier. Contrairement à `bilan-skeleton.tsx`/
 * `repos-skeleton.tsx` (qui INCLUENT leur sélecteur — visible pour TOUS les rôles),
 * le sélecteur de membre admin (widget client, `useRouter`, dans `PlanningHeader`) est
 * ici OMIS : il n'est affiché QUE pour un admin, et le rôle est inconnu à ce stade
 * (`loading.tsx` n'a pas accès au profil) — CLS mineur assumé pour les admins au premier
 * chargement plein-page. Source unique, importée par `loading.tsx` ET le fallback
 * `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2).
 */
export function PlanningSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
