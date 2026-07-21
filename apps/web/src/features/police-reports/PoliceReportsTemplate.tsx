import { todayParis } from '@glagency/core'
import { ReportForm } from './components/report-form'
import { ReportHistory } from './components/report-history'
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
  currentProfileId,
}: {
  models: ReportOption[]
  reports: PoliceReport[]
  /** Chatteurs pré-chargés par modèle (clé = id du modèle) — évite tout appel au changement de
   *  modèle. `{}` pour un lecteur seul (pas de formulaire). */
  chattersByModel: Record<string, ReportOption[]>
  canWrite: boolean
  /** Spectateur — gate la corbeille dans l'historique (on ne supprime que ses propres rapports). */
  currentProfileId: string
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

      {/* Consultation / historique (filtrable par modèle / par chatteur). Rendu INCONDITIONNEL :
          la consultation est ouverte à tout le monde (lecteurs seuls compris), seule la saisie
          ci-dessus est réservée aux écrivains. */}
      <ReportHistory reports={reports} currentProfileId={currentProfileId} />
    </div>
  )
}
