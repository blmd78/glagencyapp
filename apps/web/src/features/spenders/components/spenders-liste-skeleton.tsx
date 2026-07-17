import { KpiSkeleton } from '@/components/skeletons/kpi-skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

/**
 * Silhouette du bloc de données de la vue « Liste » (seule des 4 vues spenders à afficher
 * des KPIs, cf. `SpendersTemplate.tsx` : `view === 'liste'`), dimensions ~ contenu réel
 * (anti-CLS) — composition de 2 briques génériques (KpiSkeleton 4 cartes + TableSkeleton),
 * pas une brique unique → composant dédié (docs/guidelines-standard-feature.md §2.4).
 * Source unique : importée par `app/(dash)/chatter/spenders/liste/loading.tsx` ET le
 * fallback `<Suspense>` de `liste/page.tsx` — jamais de markup dupliqué entre les deux.
 * a11y déjà portée par KpiSkeleton/TableSkeleton (chacun son propre `role="status"`) —
 * pas de doublon ici.
 */
export function SpendersListeSkeleton() {
  return (
    <>
      <KpiSkeleton />
      <TableSkeleton />
    </>
  )
}
