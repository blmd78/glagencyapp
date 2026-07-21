import { todayParis } from '@glagency/core'
import { ReportForm } from './components/report-form'
import type { PoliceReport, ReportOption } from './types'

/**
 * Rapport du soir (section Police) — Server Component, aucun fetch (données en props via
 * `page.tsx`). La saisie (`ReportForm`) est réservée aux écrivains (`canWrite`) : un lecteur
 * seul ne voit que la consultation. Consultation / historique (filtrable par modèle / par
 * chatteur) = tâche 5, emplacement réservé plus bas.
 */
export function PoliceReportsTemplate({
  models,
  reports,
  chattersByModel,
  canWrite,
}: {
  models: ReportOption[]
  reports: PoliceReport[]
  /** Chatteurs pré-chargés par modèle (clé = id du modèle) — évite tout appel au changement de
   *  modèle. `{}` pour un lecteur seul (pas de formulaire). */
  chattersByModel: Record<string, ReportOption[]>
  canWrite: boolean
}) {
  const today = todayParis()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rapport du soir</h1>
        <p className="text-sm text-muted-foreground">
          Chiffres du modèle et suivi individuel des chatteurs, un rapport par modèle et par soir.
        </p>
      </div>

      {/* Saisie masquée pour un lecteur seul (comme le Tracker, police-view.tsx:85). */}
      {canWrite && (
        <ReportForm
          models={models}
          reports={reports}
          chattersByModel={chattersByModel}
          today={today}
        />
      )}

      {/* Consultation / historique (filtrable par modèle / par chatteur) — tâche 5. */}
    </div>
  )
}
