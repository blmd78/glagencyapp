import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du contenu de l'onglet Planning journalier (1er bloc = titre `h2 text-lg` + sous-
 * titre de `PlanningHeader`). Le `h1` « Planning », lui, est monté par `page.tsx` HORS du
 * `<Suspense>` : il reste affiché pendant que ce squelette s'affiche (jamais démonté). Le
 * sélecteur de personne et la barre d'onglets, eux, sont ENCORE en squelette à ce moment-là —
 * leur silhouette est assemblée dans le fallback du `<Suspense>` de `page.tsx`, pas ici (cf.
 * `member-select.tsx`/`todos-tabs.tsx`). Fallback du `<Suspense>` de `page.tsx` quand
 * `?vue=planning` (ou absent) ; `loading.tsx` (silhouette plein-page, commune aux deux
 * onglets, affichée avant que le rôle soit connu) a son propre fallback neutre, distinct.
 */
export function PlanningSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <div aria-hidden="true" className="space-y-2">
        <Skeleton className="h-5 w-64" />
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
