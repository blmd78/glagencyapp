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
 * ORDRE DE LECTURE, revu le 2026-09-04 (« les managers sont perdus, c'est illisible ») : le
 * décompte de la promo, puis LES ONGLETS tout de suite — c'est ce qu'on vient lire. Les
 * signalements, qui sont une file d'exceptions, et le coût IA, qui est une facture, descendent
 * dessous. Avant, les deux tableaux du roster (245 lignes en production) séparaient le haut de
 * page de ce qu'on cherchait.
 *
 * Le sélecteur de chatter reste au-dessus des onglets : c'est un raccourci vers une fiche, il ne
 * dépend d'aucun onglet. Sur la FICHE d'un chatter il est en tête — c'est le seul moyen d'en
 * changer.
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
          <OverviewRosterCount roster={overview.roster} />
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
          <OverviewReports reports={overview.reports} isAdmin={isAdmin} />
          {overview.cost && <OverviewKpis rows={overview.cost.rows} estimatedUsd={overview.cost.estimatedUsd} />}
          {overview.cost && <OverviewCost rows={overview.cost.rows} />}
        </>
      )}
    </div>
  )
}
