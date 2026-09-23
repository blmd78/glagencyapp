import { UrlTabs } from '@/components/url-tabs'
import { LiensView } from './components/liens-view'
import { LinkGraphView } from './components/link-graph-view'
import type { DailyPoint } from './daily-series'
import type { LinkOption, Modele, Reseau } from './link-options'
import type { MktGroup, MktLinkRow } from '@/lib/types/marketing'
import type { MktLinksData, MktLiensVue } from './types'

/**
 * Deux lectures de la même page, l'onglet dans l'URL (`?vue=graph`) comme partout ailleurs.
 *
 * « Classement » répond à « qui performe ? », « Graphique » à « comment ce lien a-t-il évolué ? ».
 * Le second existe parce que le premier ne portait le détail journalier que derrière un clic sur
 * le nom d'un lien — un geste que rien n'annonçait.
 */
export function MktLiensTemplate({
  data,
  vue,
  modele,
  modeleOptions,
  groups,
  detail,
}: {
  data: MktLinksData
  vue: MktLiensVue
  /** Le filtre Modèle (`?modele=`) : commun aux deux onglets, pour qu'en basculant de l'un à
   *  l'autre on retrouve la même sélection. */
  modele: Modele
  modeleOptions: LinkOption[]
  /** Les groupes de la base (0167) : libellés, couleurs et choix du menu de déplacement. */
  groups: MktGroup[]
  /** Chargé par la page uniquement en mode Graphique — `null` sur l'onglet Classement. */
  detail: {
    selected: MktLinkRow[]
    points: DailyPoint[]
    options: LinkOption[]
    reseau: Reseau
    modele: Modele
    lien: string
  } | null
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="-mt-4 text-sm text-muted-foreground">{data.period}</p>

      <UrlTabs
        value={vue}
        defaultValue="classement"
        items={[
          {
            value: 'classement',
            label: 'Classement',
            // `LiensView` rend un FRAGMENT : ses blocs comptaient sur le `flex flex-col gap-6`
            // du Template, dont l'onglet les a séparés — tout s'est retrouvé collé (2026-09-14).
            // Le conteneur qu'ils attendent les suit donc ici.
            content: (
              <div className="flex flex-col gap-6">
                <LiensView data={data} modele={modele} modeleOptions={modeleOptions} groups={groups} />
              </div>
            ),
          },
          {
            value: 'graph',
            label: 'Graphique',
            // Rendu SEULEMENT quand l'onglet est actif : sans `detail`, la page n'a pas lu de
            // série, et un graphe vide serait un mensonge plutôt qu'un chargement.
            content: detail ? <LinkGraphView {...detail} modeleOptions={modeleOptions} /> : null,
          },
        ]}
      />
    </div>
  )
}
