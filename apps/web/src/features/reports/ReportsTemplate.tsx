import { todayParis } from '@glagency/core'
import { ReportsMemberSelect } from './components/reports-member-select'
import { ReportsJournal } from './components/reports-journal'
import type { Report, ReportMember } from './types'

/**
 * Comptes rendus journaliers (« Dashboard ») — Server Component, aucun fetch (données en props).
 * Layout : sélecteur de personne (si on peut en consulter d'autres) + journal un-jour-à-la-fois.
 * Rédaction possible seulement sur le jour courant, par son auteur ; le reste est consultation.
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
  /** Nom de la personne consultée (en-tête « Comptes rendus de … »). */
  targetName: string
  /** Personnes consultables (soi + autres). Vide = pas de sélecteur. */
  members: ReportMember[]
  target: string
  /** L'auteur peut rédiger SON CR du jour (vue « moi », hors superadmin). */
  canWrite: boolean
  /** La cible consultée est soi-même. */
  isSelf: boolean
}) {
  return (
    <div className="flex flex-col gap-6">
      {members.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Consulter :</span>
          <ReportsMemberSelect value={target} members={members} />
        </div>
      )}

      {!isSelf && (
        <p className="text-sm text-muted-foreground">
          Comptes rendus de <span className="font-medium text-foreground">{targetName}</span>
        </p>
      )}

      <ReportsJournal
        reports={reports}
        today={todayParis()}
        canWriteToday={canWrite}
        isSelf={isSelf}
        targetName={targetName}
      />
    </div>
  )
}
