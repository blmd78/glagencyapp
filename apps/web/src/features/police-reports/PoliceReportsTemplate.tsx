import { ReportsView } from './components/reports-view'
import type { PoliceReport, ReportOption } from './types'

/**
 * Template Rapport du soir (section Police) — Server Component, aucun fetch (données en props
 * via `page.tsx`), passe-plat vers la feuille client `ReportsView` : même architecture que le
 * Tracker (`PoliceTemplate` → `PoliceView`), l'en-tête vit côté client pour porter le grisage
 * de transition au changement de période (audit homogénéité 2026-08-06).
 */
export function PoliceReportsTemplate({
  models,
  reports,
  chattersByModel,
  canWrite,
  currentProfileId,
  vue,
  day,
  days,
  month,
  months,
}: {
  models: ReportOption[]
  reports: PoliceReport[]
  /** Chatteurs pré-chargés par modèle (clé = id du modèle) — évite tout appel au changement de
   *  modèle. `{}` pour un lecteur seul ou en mode mois (pas de formulaire). */
  chattersByModel: Record<string, ReportOption[]>
  canWrite: boolean
  /** Spectateur — gate la corbeille et « Modifier » (on n'édite que ses propres rapports). */
  currentProfileId: string
  /** Mode d'affichage (en-tête) : `jour` (mono-jour) ou `mois` (plage du mois). */
  vue: 'jour' | 'mois'
  /** Jour sélectionné (mode jour) : cale le formulaire ET l'historique. */
  day: string
  /** Fenêtre de jours du sélecteur (aujourd'hui → 13 jours en arrière). */
  days: { day: string; label: string }[]
  /** Mois sélectionné (mode mois, 1er du mois) : cale l'historique. */
  month: string
  /** Fenêtre de mois du sélecteur (mois courant → 11 mois en arrière). */
  months: { month: string; label: string }[]
}) {
  return (
    <ReportsView
      models={models}
      reports={reports}
      chattersByModel={chattersByModel}
      canWrite={canWrite}
      currentProfileId={currentProfileId}
      vue={vue}
      day={day}
      days={days}
      month={month}
      months={months}
    />
  )
}
