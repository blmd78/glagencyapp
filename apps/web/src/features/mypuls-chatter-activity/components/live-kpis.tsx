import { Card, CardContent } from '@/components/ui/card'
import { HeaderInfo } from '@/components/data-table/header-info'
import type { LiveDetail } from '../types'

/**
 * Les 14 tuiles de la fiche MyPuls, reprises telles quelles — libellé, sous-titre et valeur.
 *
 * On ne les reformate pas et on ne les renomme pas : ce sont les définitions de MyPuls, et
 * c'est sur elles que l'encadrement discute avec les chatteurs. En inventer d'autres créerait
 * deux vocabulaires pour un même chiffre.
 *
 * Grille dense plutôt que `KpiGrid` : ces tuiles n'ont ni tendance ni comparaison, et 14 cartes
 * à liseré coloré satureraient la page.
 */
export function LiveKpis({ live }: { live: LiveDetail }) {
  if (live.status !== 'ok') return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">Mesures MyPuls du jour</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {live.activity.kpis.map((k) => (
          <Card key={k.title} className="gap-0 py-4">
            <CardContent className="px-4">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="truncate">{k.title}</span>
                {/* L'infobulle porte la ventilation par modèle quand MyPuls en fournit une. */}
                <HeaderInfo text={k.tooltip ?? k.subtitle} />
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{k.subtitle}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
