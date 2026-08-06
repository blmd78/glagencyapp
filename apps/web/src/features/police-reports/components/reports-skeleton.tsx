import { Skeleton } from '@/components/ui/skeleton'

/**
 * Silhouette de la page « Rapport du soir » — alignée sur le rendu RÉEL (audit 2026-08-06,
 * anti-CLS §2) : en-tête titre + bascule/sélecteur à droite, bouton « Ajouter un rapport »,
 * puis la table (titre de section + barre d'outils + lignes). Source unique, importée par
 * `loading.tsx` ET le fallback `<Suspense>` de `page.tsx` (guidelines-standard-feature §2).
 * a11y : `role="status"` + `sr-only`.
 */
export function PoliceReportsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status">
      <span className="sr-only">Chargement…</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" aria-hidden />
          <Skeleton className="h-4 w-80" aria-hidden />
        </div>
        <div className="ml-auto">
          <Skeleton className="h-9 w-56" aria-hidden />
        </div>
      </div>
      <Skeleton className="h-9 w-44" aria-hidden />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-44" aria-hidden />
        <Skeleton className="h-9 w-72" aria-hidden />
        <Skeleton className="h-64 w-full rounded-xl" aria-hidden />
      </div>
    </div>
  )
}
