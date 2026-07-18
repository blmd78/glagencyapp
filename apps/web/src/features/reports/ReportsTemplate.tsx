import { addDays, todayParis } from '@glagency/core'
import { ReportsView } from './components/reports-view'
import { REPORT_WINDOW_DAYS, type Report, type ReportMember } from './types'

/**
 * Comptes rendus journaliers (« Dashboard ») — Server Component, aucun fetch (données en props).
 * Toute l'interactivité (sélecteur personne + sélecteur date + édition) vit dans ReportsView.
 * Rédaction possible seulement sur le jour courant, par son auteur ; le reste = consultation.
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
  /** Personnes consultables (soi + autres). Vide = pas de sélecteur de personne. */
  members: ReportMember[]
  target: string
  /** L'auteur peut rédiger SON CR du jour (vue « moi », hors superadmin). */
  canWrite: boolean
  /** La cible consultée est soi-même. */
  isSelf: boolean
}) {
  const today = todayParis()
  return (
    <ReportsView
      reports={reports}
      members={members}
      target={target}
      today={today}
      minDay={addDays(today, -REPORT_WINDOW_DAYS)}
      canWrite={canWrite}
      isSelf={isSelf}
      targetName={targetName}
    />
  )
}
