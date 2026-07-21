import { DaySelect } from '@/components/day-select'
import { MonthSelect } from '@/components/month-select'
import { PeriodToggle } from '@/components/period-toggle'
import { ReportForm } from './components/report-form'
import { ReportHistory } from './components/report-history'
import type { PoliceReport, ReportOption } from './types'

/**
 * Rapport du soir (section Police) — Server Component, aucun fetch (données en props via
 * `page.tsx`). Piloté par une VUE (`PeriodToggle` d'en-tête, composant PARTAGÉ avec le Tracker) :
 * en JOUR, le `DaySelect` cale la page sur un jour (`?day=`, formulaire + historique du jour) ; en
 * MOIS, le `MonthSelect` la cale sur un mois (`?month=`, historique groupé par jour). La saisie
 * (`ReportForm`) est réservée aux écrivains (`canWrite`) ET au mode jour uniquement — le mois est
 * une consultation pure (on ne saisit pas un rapport mensuel).
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
  /** Spectateur — gate la corbeille dans l'historique (on ne supprime que ses propres rapports). */
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
    <div className="flex flex-col gap-6">
      {/* En-tête : titre à gauche ; à droite la bascule Jour/Mois PUIS le sélecteur du mode actif. */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapport du soir</h1>
          <p className="text-sm text-muted-foreground">
            Chiffres du modèle et suivi individuel des chatteurs, un rapport par modèle et par soir.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <PeriodToggle vue={vue} />
          {vue === 'jour' ? (
            <DaySelect day={day} days={days} />
          ) : (
            <MonthSelect month={month} months={months} />
          )}
        </div>
      </div>

      {/* Saisie masquée pour un lecteur seul (comme le Tracker, police-view.tsx) ET hors mode jour :
          en mois = consultation, on ne saisit pas un rapport mensuel. Le jour vient de l'en-tête
          (`day`), plus de champ date dans le formulaire. */}
      {canWrite && vue === 'jour' && (
        <ReportForm
          models={models}
          reports={reports}
          chattersByModel={chattersByModel}
          currentProfileId={currentProfileId}
          day={day}
        />
      )}

      {/* Consultation / historique (filtrable par modèle / par chatteur). Rendu INCONDITIONNEL : la
          consultation est ouverte à tout le monde (lecteurs seuls compris), seule la saisie ci-dessus
          est réservée aux écrivains. En mois, l'historique regroupe les rapports par jour. */}
      <ReportHistory reports={reports} currentProfileId={currentProfileId} vue={vue} />
    </div>
  )
}
