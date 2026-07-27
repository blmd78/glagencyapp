import { todayParis } from '@glagency/core'
import { MemberSelect } from '@/components/member-select'
import { ReportPanel } from './components/report-panel'
import { ReportsMembers } from './components/reports-members'
import type { Report, ReportEntry, ReportMember } from './types'

/**
 * Comptes rendus journaliers (« Dashboard ») — Server Component, aucun fetch (données en
 * props). Depuis 2026-07-26 : TOUS les noms consultables sont posés sur la page, un par ligne,
 * dépliables sur leurs comptes rendus (maquette du propriétaire). Le sélecteur `?membre=`
 * reste disponible pour se restreindre à UNE personne — la page ne passe alors qu'une entrée,
 * affichée à plat avec ses comptes rendus déjà chargés (`reports`), sans aller-retour. Les
 * chatteurs ne figurent pas dans la liste (filtre de `getReportMembers`). Rédaction possible
 * seulement sur le jour courant, par son auteur ; le reste = consultation.
 */
export function ReportsTemplate({
  entries,
  reports,
  selectableMembers,
  filterId,
}: {
  /** Les personnes AFFICHÉES : toutes, ou la seule retenue par le filtre. */
  entries: ReportEntry[]
  /** Comptes rendus de la personne affichée à plat — vide en mode pile (chargés à l'ouverture). */
  reports: Report[]
  /** Toutes les personnes consultables — alimente le sélecteur, jamais filtré. */
  selectableMembers: ReportMember[]
  /** `?membre=` validé (`null` = pas de filtre). */
  filterId: string | null
}) {
  const today = todayParis()

  return (
    <div className="flex flex-col gap-6">
      {/* Pas de sélecteur quand on est seul à consulter (rédacteur sans encadré). */}
      {selectableMembers.length > 1 && (
        <div className="flex justify-end">
          <MemberSelect members={selectableMembers} value={filterId} allowAll />
        </div>
      )}
      {entries.length === 1 ? (
        // Une seule personne (filtre, ou rédacteur seul) : pas d'accordéon à une seule ligne.
        <ReportPanel
          reports={reports}
          today={today}
          canWrite={entries[0].canWrite}
          idSuffix={entries[0].id}
        />
      ) : (
        <ReportsMembers entries={entries} today={today} />
      )}
    </div>
  )
}
