import { Skeleton } from '@/components/ui/skeleton'
import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'

/**
 * Silhouette du CONTENU de Police (KPIs + bouton de saisie + table) — le h1 et le sous-titre
 * sont IMMÉDIATS dans `page.tsx` depuis le retrait des sélecteurs Jour/Mois (2026-08-17 : la
 * période vient du datepicker global du header, le bloc titre n'a plus de widget client).
 * Source unique : importée par `loading.tsx` (enrobée de `RouteLoading` pour le bloc titre)
 * ET le fallback `<Suspense>` de `page.tsx` (docs/guidelines-standard-feature.md §2 — jamais
 * de markup de skeleton dupliqué).
 */
export function PoliceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* a11y (role="status" + sr-only) déjà portée par KpiSkeleton — pas de doublon ici. */}
      <KpiSkeleton count={3} />
      {/* Bouton « Ajouter une sanction » (la saisie est en dialog depuis 2026-08-06 — l'ancien
          panneau h-40 provoquait un saut de mise en page) puis la table (titre + toolbar + lignes). */}
      <Skeleton className="h-9 w-44" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  )
}
