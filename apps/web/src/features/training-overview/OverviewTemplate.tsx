import { OverviewChatter } from './components/overview-chatter'
import { OverviewCost } from './components/overview-cost'
import { OverviewKpis } from './components/overview-kpis'
import { OverviewPicker } from './components/overview-picker'
import { OverviewReports } from './components/overview-reports'
import { OverviewRoster, OverviewRosterCount } from './components/overview-roster'
import type { ChatterDetail, OverviewData } from './types'

/**
 * Overview encadrant (droit Suivi) : `?chatter=<profileId>` affiche la FICHE d'un chatter, sinon
 * le roster de la promo, les signalements, et le coût IA pour un admin. Server Component, aucun
 * fetch (guidelines-data-loading §3) ; le nom de la fiche est repris du roster — le service
 * `getChatter` n'a pas à le re-requêter.
 *
 * Ordre de lecture : le coût IA en cartes KPI (admin), le décompte de la promo, la file de travail
 * qu'est la liste des signalements, puis les TABLEAUX — roster et détail du coût par jour.
 *
 * Le sélecteur de chatter descend juste au-dessus des tableaux : c'est là qu'il sert. Sur la FICHE
 * d'un chatter il reste en tête — c'est le seul moyen d'en changer, et il n'y a pas de tableau
 * au-dessus duquel le poser.
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
  // Roster vide (personne n'a encore le droit Entraînement) : un sélecteur à une seule entrée
  // « Tous les chatters » n'offre aucun choix — le message du roster suffit.
  const picker =
    showPicker && overview.roster.length > 0 ? <OverviewPicker roster={overview.roster} selectedId={selectedId} /> : null
  return (
    <div className="flex flex-col gap-8">
      {chatter ? (
        <>
          {picker}
          <OverviewChatter detail={chatter} displayName={selectedName} />
        </>
      ) : (
        <>
          {overview.cost && <OverviewKpis rows={overview.cost.rows} estimatedUsd={overview.cost.estimatedUsd} />}
          <OverviewRosterCount roster={overview.roster} />
          <OverviewReports reports={overview.reports} isAdmin={isAdmin} />
          {picker}
          <OverviewRoster roster={overview.roster} totalCases={overview.totalCases} />
          {overview.cost && <OverviewCost rows={overview.cost.rows} />}
        </>
      )}
    </div>
  )
}
