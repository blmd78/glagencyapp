import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette du CONTENU de « Rapport du soir » — le h1 et le sous-titre sont IMMÉDIATS dans
 * `page.tsx` depuis le retrait des sélecteurs Jour/Mois (2026-08-17, période = datepicker
 * global) : bouton « Ajouter un rapport », puis la table (titre de section + barre d'outils +
 * lignes). Source unique, importée par `loading.tsx` (enrobée de `RouteLoading` pour le bloc
 * titre) ET le fallback `<Suspense>` de `page.tsx` (guidelines-standard-feature §2).
 * a11y : `role="status"` + `sr-only`.
 */
export function PoliceReportsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Chargement…</span>
      <Skeleton className="h-9 w-44" aria-hidden />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-44" aria-hidden />
        <Skeleton className="h-9 w-72" aria-hidden />
        <Skeleton className="h-64 w-full rounded-xl" aria-hidden />
      </div>
    </div>
  )
}
