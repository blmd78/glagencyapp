import { addDays, todayParis } from '@glagency/core'
import { ReportsMemberSelect } from './components/reports-member-select'
import { ReportForm } from './components/report-form'
import { ReportsList } from './components/reports-list'
import { REPORT_WINDOW_DAYS, type Report, type ReportMember } from './types'

/**
 * Comptes rendus journaliers (« Dashboard ») — Server Component, aucun fetch (données en props).
 * Layout : sélecteur (si on peut consulter d'autres personnes) + form de rédaction (vue « moi »,
 * hors superadmin) + liste antéchrono. L'interactivité vit dans les feuilles client.
 */
export function ReportsTemplate({
  reports,
  targetName,
  members,
  target,
  canWrite,
  isSelf,
}: {
  reports: Report[]
  /** Nom de la personne consultée (pour l'en-tête « Comptes rendus de … »). */
  targetName: string
  /** Personnes consultables (soi + autres). Vide = pas de sélecteur. */
  members: ReportMember[]
  target: string
  /** Peut rédiger (= vue « moi » et pas superadmin). */
  canWrite: boolean
  /** La cible consultée est soi-même. */
  isSelf: boolean
}) {
  const today = todayParis()
  return (
    <div className="flex flex-col gap-6">
      {members.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Consulter :</span>
          <ReportsMemberSelect value={target} members={members} />
        </div>
      )}

      {canWrite && (
        <ReportForm today={today} minDay={addDays(today, -REPORT_WINDOW_DAYS)} reports={reports} />
      )}

      {!isSelf && (
        <p className="text-sm text-muted-foreground">
          Comptes rendus de <span className="font-medium text-foreground">{targetName}</span>
        </p>
      )}

      <ReportsList
        reports={reports}
        canDelete={canWrite}
        emptyLabel={
          canWrite
            ? 'Aucun compte rendu pour l’instant — rédige le premier ci-dessus.'
            : isSelf
              ? 'Aucun compte rendu pour l’instant.'
              : `Aucun compte rendu de ${targetName} sur les 30 derniers jours.`
        }
      />
    </div>
  )
}
