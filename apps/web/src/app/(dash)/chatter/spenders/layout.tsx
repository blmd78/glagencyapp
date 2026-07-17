import type { ReactNode } from 'react'
import { SpendersAutoRefresh } from '@/features/spenders/components/spenders-auto-refresh'

/**
 * Layout structurel des 4 vues Spenders (liste/tracker/alertes/archive) — PLUS de fetch
 * ici (normalisation batch 4, docs/guidelines-standard-feature.md) : chaque `page.tsx`
 * fait désormais son propre appel à `getSpenders()` (pattern standard, garde + kickoff
 * sans await + Suspense). Ce layout ne sert plus qu'à monter `SpendersAutoRefresh` UNE
 * SEULE FOIS pour tout le sous-arbre — Next ne re-exécute pas un layout en naviguant
 * entre ses enfants, donc le timer de polling (3 min) survit aux bascules d'onglet
 * exactement comme avant (le remonter dans chaque page réinitialiserait le timer à
 * chaque navigation, ce qui l'empêcherait quasiment de jamais se déclencher).
 * `revalidatePath('/chatter/spenders', 'layout')` (actions.ts) continue de fonctionner à
 * l'identique : le scope 'layout' invalide tout page partageant CE layout — les 4
 * vraies vues — qu'il y ait un fetch au niveau layout ou non.
 */
export default function SpendersLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SpendersAutoRefresh />
      {children}
    </>
  )
}
