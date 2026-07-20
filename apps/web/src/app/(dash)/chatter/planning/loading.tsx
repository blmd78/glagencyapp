import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette NEUTRE : un `loading.tsx` ne reçoit pas `searchParams`, donc on ne sait pas quel
 * onglet va s'afficher — pas de squelette de contenu ici. Elle reprend la 1re ligne réelle de
 * `page.tsx` (le `h1` seul, sans sous-titre ni sélecteur à côté), puis sélecteur + barre
 * d'onglets. Mêmes dimensions que le fallback du `<Suspense>` de `page.tsx` (titre en plus,
 * lui hors boundary) : les deux silhouettes s'enchaînent sans saut visible, le contenu
 * spécifique à l'onglet prenant ensuite le relais dans ce fallback-là.
 */
export default function Loading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement…</span>
      <Skeleton aria-hidden="true" className="h-7 w-48" />
      <div aria-hidden="true" className="flex justify-end">
        <Skeleton className="h-9 w-52" />
      </div>
      <Skeleton aria-hidden="true" className="h-10 w-64" />
    </div>
  )
}
