'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { modelColor } from '@/lib/model-color'
import { MetricDailyPanel } from '@/components/metric-chart/metric-daily-panel.client'
import { LinkTotals } from './link-totals'
import { commonGroup, sumLinks } from '../link-options'
import { toMetricPoints, type DailyPoint } from '../daily-series'
import type { MktGroup, MktLinkRow } from '@/lib/types/marketing'

/**
 * Le détail journalier d'un lien, en modale.
 *
 * Ouverte par `?lien=<id>` — l'état vit dans l'URL comme partout ailleurs dans le CRM
 * (`?week=`, `?vue=`, `?owner=`) : la vue se partage, et le retour arrière la referme. La
 * fermeture retire le seul paramètre `lien` et garde le reste (la période du header, surtout).
 *
 * Les TOTAUX viennent de la ligne du tableau, pas d'une somme des points : c'est le même agrégat
 * que celui qu'on vient de cliquer, donc les deux ne peuvent pas diverger d'un centime d'arrondi.
 */
export function LinkDailyDialog({
  link,
  points,
  groups,
}: {
  link: MktLinkRow
  points: DailyPoint[]
  /** Pour habiller le graphe de la couleur et du nom du réseau du lien. */
  groups: MktGroup[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const close = () => {
    const params = new URLSearchParams(searchParams)
    params.delete('lien')
    const qs = params.toString()
    router.replace((qs ? `/marketing/liens?${qs}` : '/marketing/liens') as Route, { scroll: false })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-left">
            <span className="min-w-0 break-all">{link.name}</span>
            {link.creator ? (
              <Badge className={modelColor(link.creator)}>{link.creator}</Badge>
            ) : null}
            {!link.active ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                disparu
              </Badge>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <LinkTotals totals={sumLinks([link])} />

        {/* Le MÊME panneau que le mode Graphique et l'Overview (métrique, rendu), sans sa carte —
            on est déjà dans une modale. */}
        <MetricDailyPanel
          bare
          daily={toMetricPoints(points)}
          subtitle="Jour par jour sur la période"
          identity={(() => {
            const g = commonGroup([link], groups)
            return g ? { label: g.label, color: g.color } : null
          })()}
        />

        {/* Les jours sans ligne sont rendus à zéro (`dailySeries`) : sans ça la courbe relierait
            deux points distants et ferait passer un lien muet pour un lien actif. */}
        <p className="text-xs text-muted-foreground">
          Un jour à zéro est un jour sans activité — pas une donnée manquante.
        </p>
      </DialogContent>
    </Dialog>
  )
}
