import { OverviewChatter } from './components/overview-chatter'
import { OverviewCost } from './components/overview-cost'
import { OverviewKpis } from './components/overview-kpis'
import { OverviewPicker } from './components/overview-picker'
import { OverviewReports } from './components/overview-reports'
import { OverviewRoster } from './components/overview-roster'
import type { ChatterDetail, OverviewData } from './types'

/**
 * Overview encadrant (droit Suivi) : `?chatter=<profileId>` affiche la FICHE d'un chatter, sinon
 * le roster de la promo, les signalements, et le coût IA pour un admin. Server Component, aucun
 * fetch (guidelines-data-loading §3) ; le nom de la fiche est repris du roster — le service
 * `getChatter` n'a pas à le re-requêter.
 *
 * Ordre de lecture : ce qu'on vient voir d'abord (les chiffres, puis la file de travail qu'est
 * la liste des signalements), les TABLEAUX ensuite — roster puis détail du coût. Les totaux du
 * coût IA sont dans le bandeau, plus dans l'encart du bas.
 */
export function OverviewTemplate({
  overview,
  chatter,
  selectedId,
  showPicker,
  isAdmin,
}: {
  overview: OverviewData
  chatter: ChatterDetail | null
  selectedId: string | null
  showPicker: boolean
  isAdmin: boolean
}) {
  const selectedName = overview.roster.find((r) => r.profileId === selectedId)?.displayName ?? '—'
  return (
    <div className="flex flex-col gap-8">
      {/* Roster vide (personne n'a encore le droit Entraînement) : un sélecteur à une seule entrée
          « Tous les chatters » n'offre aucun choix — le message du roster suffit. */}
      {showPicker && overview.roster.length > 0 && <OverviewPicker roster={overview.roster} selectedId={selectedId} />}
      {chatter ? (
        <OverviewChatter detail={chatter} displayName={selectedName} />
      ) : (
        <>
          <OverviewKpis roster={overview.roster} cost={overview.cost} />
          <OverviewReports reports={overview.reports} isAdmin={isAdmin} />
          <OverviewRoster roster={overview.roster} totalCases={overview.totalCases} />
          {overview.cost && <OverviewCost rows={overview.cost.rows} />}
        </>
      )}
    </div>
  )
}
