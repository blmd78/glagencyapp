import { Badge } from '@/components/ui/badge'
import { modelColor } from '@/lib/model-color'
import { LinkDailyChart } from './link-daily-chart'
import { LinkPicker } from './link-picker'
import { LinkTotals } from './link-totals'
import { sumLinks, type LinkOption, type Modele, type Reseau } from '../link-options'
import type { DailyPoint } from '../daily-series'
import type { MktLinkRow } from '@/lib/types/marketing'

/**
 * Le mode Graphique : on choisit un réseau, une modèle, puis un lien (ou tous), on lit le jour
 * par jour. L'axe MODÈLE cumule tous ses liens d'un coup — ce que MyPuls oblige à faire un par un.
 *
 * L'autre chemin vers le détail d'UN lien est le clic sur son nom dans le classement, qui ouvre
 * la MÊME courbe en modale. Les deux partagent service, graphe et totaux — seul l'emballage
 * change.
 */
export function LinkGraphView({
  selected,
  points,
  options,
  modeleOptions,
  reseau,
  modele,
  lien,
}: {
  /** Les liens tracés : un seul, ceux d'une modèle, ceux d'un réseau, ou toute l'agence. */
  selected: MktLinkRow[]
  points: DailyPoint[]
  options: LinkOption[]
  modeleOptions: LinkOption[]
  reseau: Reseau
  modele: Modele
  lien: string
}) {
  // Un seul lien retenu : on peut nommer sa modèle et dire s'il a disparu. Sur un cumul, ces
  // deux informations n'ont pas de valeur unique — on affiche le nombre de liens à la place.
  const seul = selected.length === 1 ? selected[0] : null

  return (
    <div className="flex flex-col gap-6">
      <LinkPicker
        options={options}
        modeleOptions={modeleOptions}
        reseau={reseau}
        modele={modele}
        lien={lien}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {seul ? (
          <>
            {seul.creator ? <Badge className={modelColor(seul.creator)}>{seul.creator}</Badge> : null}
            {!seul.active ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                disparu
              </Badge>
            ) : null}
          </>
        ) : (
          <span>
            {selected.length} lien{selected.length > 1 ? 's' : ''} cumulé
            {selected.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <LinkTotals totals={sumLinks(selected)} />
      <LinkDailyChart data={points} />

      {/* Cf. `dailySeries` : les jours sans ligne sont rendus à zéro, faute de quoi la courbe
          relierait deux points distants et ferait passer un lien muet pour un lien actif. */}
      <p className="text-xs text-muted-foreground">
        Un jour sans barre est un jour sans activité — pas une donnée manquante.
      </p>
    </div>
  )
}
