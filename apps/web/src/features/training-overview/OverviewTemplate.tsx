import { UrlTabs } from '@/components/url-tabs'
import { OverviewChatter } from './components/overview-chatter'
import { OverviewCost } from './components/overview-cost'
import { OverviewKpis } from './components/overview-kpis'
import { OverviewPicker } from './components/overview-picker'
import { OverviewReports } from './components/overview-reports'
import {
  NEARLY_READY_PCT,
  OverviewRosterCount,
  OverviewRosterTable,
  nearlyReadyCount,
  sortRoster,
} from './components/overview-roster'
import type { ChatterDetail, OverviewData } from './types'

/** L'onglet d'accueil ne s'écrit PAS dans l'URL (cf. `UrlTabs`) — c'est la file d'attente. */
export const ROSTER_TABS = ['formation', 'agence'] as const
export type RosterTab = (typeof ROSTER_TABS)[number]

/**
 * Overview encadrant (droit Suivi) : `?chatter=<profileId>` affiche la FICHE d'un chatter, sinon
 * le roster de la promo EN DEUX ONGLETS (`?vue=`), les signalements, et le coût IA pour un admin.
 * Server Component, aucun fetch (guidelines-data-loading §3) ; le nom de la fiche est repris du
 * roster — le service `getChatter` n'a pas à le re-requêter.
 *
 * ORDRE DE LECTURE INCHANGÉ (2026-09-04) : le coût IA en cartes KPI (admin), le décompte de la
 * promo, la file de travail qu'est la liste des signalements, puis les TABLEAUX. Les onglets ne
 * remplacent que les deux sections empilées du roster — ils ne déplacent rien d'autre.
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
  tab,
}: {
  overview: OverviewData
  chatter: ChatterDetail | null
  selectedId: string | null
  showPicker: boolean
  isAdmin: boolean
  tab: RosterTab
}) {
  const selectedName = overview.roster.find((r) => r.profileId === selectedId)?.displayName ?? '—'
  // Roster vide (personne n'a encore le droit Entraînement) : un sélecteur à une seule entrée
  // « Tous les chatters » n'offre aucun choix — le message du roster suffit.
  const picker =
    showPicker && overview.roster.length > 0 ? <OverviewPicker roster={overview.roster} selectedId={selectedId} /> : null

  const sorted = sortRoster(overview.roster)
  const enFormation = sorted.filter((r) => r.inTraining)
  const enAgence = sorted.filter((r) => !r.inTraining)
  const nearly = nearlyReadyCount(enFormation, overview.totalCases)

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
          {overview.roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Personne n’a encore le droit « Entraînement » — attribue-le depuis Membres.
            </p>
          ) : (
            <UrlTabs
              value={tab}
              defaultValue="formation"
              items={[
                {
                  value: 'formation',
                  label: `En formation (${enFormation.length})`,
                  content: (
                    <OverviewRosterTable
                      rows={enFormation}
                      totalCases={overview.totalCases}
                      withModel={false}
                      subtitle={
                        enFormation.length === 0
                          ? null
                          : nearly === 0
                            ? `Personne au-dessus de ${NEARLY_READY_PCT} % pour l’instant`
                            : `${nearly} au-dessus de ${NEARLY_READY_PCT} % — bientôt en agence`
                      }
                    />
                  ),
                },
                {
                  value: 'agence',
                  label: `En agence (${enAgence.length})`,
                  content: <OverviewRosterTable rows={enAgence} totalCases={overview.totalCases} withModel />,
                },
              ]}
            />
          )}
          {overview.cost && <OverviewCost rows={overview.cost.rows} />}
        </>
      )}
    </div>
  )
}
