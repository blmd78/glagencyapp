import { ReportsView } from './components/reports-view'
import type { PoliceReport, ReportOption } from './types'

/**
 * Template Rapport du soir (section Police) — Server Component, aucun fetch (données en props
 * via `page.tsx`), passe-plat vers la feuille client `ReportsView` : même architecture que le
 * Tracker (`PoliceTemplate` → `PoliceView`). La période vient du datepicker global du header
 * (le h1 est immédiat dans `page.tsx` depuis le retrait des sélecteurs Jour/Mois, 2026-08-17).
 */
export function PoliceReportsTemplate({
  models,
  reports,
  prefillReports,
  chattersByModel,
  canWrite,
  currentProfileId,
}: {
  models: ReportOption[]
  /** Rapports de la PÉRIODE affichée (historique). */
  reports: PoliceReport[]
  /** Rapports de la FENÊTRE DE SAISIE (14 j) — pré-remplissage du formulaire, quel que soit le
   *  jour choisi au datepicker (l'upsert est keyé auteur/modèle/jour). `[]` pour un lecteur. */
  prefillReports: PoliceReport[]
  /** Chatteurs pré-chargés par modèle (clé = id du modèle) — évite tout appel au changement de
   *  modèle. `{}` pour un lecteur seul (pas de formulaire). */
  chattersByModel: Record<string, ReportOption[]>
  canWrite: boolean
  /** Spectateur — gate la corbeille et « Modifier » (on n'édite que ses propres rapports). */
  currentProfileId: string
}) {
  return (
    <ReportsView
      models={models}
      reports={reports}
      prefillReports={prefillReports}
      chattersByModel={chattersByModel}
      canWrite={canWrite}
      currentProfileId={currentProfileId}
    />
  )
}
