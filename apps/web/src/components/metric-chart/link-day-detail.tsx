import { X } from 'lucide-react'
import { frDayLong } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { eur, int } from '@/lib/format'
import { linksFor, type ByLinkMetric, type MetricPoint } from './options'

/**
 * Tous les liens qui ont amené des subs (demande 2026-10-12) ou du CA (2026-10-15) un jour donné,
 * ouverts par un clic sur ce jour : l'infobulle n'en montre que le haut et disparaît dès que la
 * souris la quitte. En colonnes, pour que le classement se lise de haut en bas.
 */
export function LinkDayDetail({
  point,
  metric,
  onClose,
}: {
  point: MetricPoint
  metric: ByLinkMetric
  onClose: () => void
}) {
  const links = linksFor(point, metric)
  const fmt = metric === 'revenue' ? eur : int
  const total = metric === 'revenue' ? eur(point.revenue) : `${int(point.conversions)} subs`
  return (
    <div className="mt-4 flex flex-col gap-3 px-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          {frDayLong(point.date)}
          <span className="font-normal text-muted-foreground">
            {' '}
            · {total} · {links.length} {links.length > 1 ? 'liens' : 'lien'}
          </span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-full text-muted-foreground"
          aria-label="Fermer le détail du jour"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="gap-8 text-sm sm:columns-2">
        {links.map((l, i) => (
          <div key={i} className="flex break-inside-avoid items-baseline justify-between gap-3 py-0.5">
            <span className="min-w-0 truncate">
              {l.name}
              {l.creator && <span className="text-muted-foreground"> · {l.creator}</span>}
            </span>
            <span className="tabular-nums">{fmt(l.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
