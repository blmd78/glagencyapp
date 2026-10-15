'use client'

import { frDayLong, frDayMonthShort } from '@glagency/core'
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { int, eur } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  SERIES,
  TOOLTIP_LINKS,
  isByLinkMetric,
  linksFor,
  type ByLinkMetric,
  type ChartMode,
  type Metric,
  type MetricPoint,
} from './options'

/**
 * UNE métrique par jour, en barres, en courbe ou les deux.
 *
 * Une seule série par graphe, et donc un seul axe : les trois d'avant partageaient la même
 * échelle alors qu'elles n'ont ni la même unité ni le même ordre de grandeur — sur septembre,
 * 3 307 clics par jour contre 257 abonnés, qui tenaient sur 5 % de la hauteur. « Tout » est donc
 * rendu en trois petits graphes empilés (cf. le panneau), chacun sur son échelle.
 *
 * `color` remplace la couleur de la métrique : c'est celle du RÉSEAU quand la sélection n'en
 * compte qu'un (écran Liens) — on doit savoir d'un coup d'œil qu'on regarde Instagram.
 *
 * En mode « les deux », la courbe reprend les MÊMES valeurs que les barres ; les barres
 * s'estompent pour qu'elle se lise, et elle n'entre pas dans l'infobulle, qui sinon afficherait
 * chaque chiffre deux fois.
 *
 * `onDayClick` : un clic sur un jour remonte sa date — le panneau y ouvre la liste complète des
 * liens du jour pour cette métrique, que l'infobulle ne peut pas porter (elle disparaît dès que la
 * souris la quitte).
 */
export function MetricDailyChart({
  data,
  metric,
  mode,
  color,
  height = 280,
  showXAxis = true,
  onDayClick,
}: {
  data: MetricPoint[]
  metric: Metric
  mode: ChartMode
  color?: string
  height?: number
  /** Masqué sur les petits graphes du haut en mode « Tout » : un seul axe des dates, en bas. */
  showXAxis?: boolean
  onDayClick?: (date: string) => void
}) {
  const s = SERIES[metric]
  const teinte = color ?? s.color
  const config = { [metric]: { label: s.label, color: teinte } } satisfies ChartConfig

  return (
    <ChartContainer
      config={config}
      className={cn('aspect-auto w-full', onDayClick && 'cursor-pointer')}
      style={{ height }}
    >
      <ComposedChart
        data={data}
        barCategoryGap="18%"
        onClick={(state) => {
          if (onDayClick && state?.activeLabel) onDayClick(String(state.activeLabel))
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          hide={!showXAxis}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => frDayMonthShort(v)}
        />
        <YAxis tickLine={false} axisLine={false} width={44} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(v) => frDayLong(v as string)}
              formatter={(value, _name, item) => (
                <>
                  <span className="flex w-full items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">{s.label}</span>
                    <span className="tabular-nums">
                      {metric === 'revenue' ? eur(Number(value)) : int(Number(value))}
                    </span>
                  </span>
                  {isByLinkMetric(metric) && (
                    <ByLink point={item.payload as MetricPoint} metric={metric} clickable={!!onDayClick} />
                  )}
                </>
              )}
            />
          }
        />
        {mode !== 'line' && (
          <Bar
            dataKey={metric}
            fill={teinte}
            fillOpacity={mode === 'both' ? 0.35 : 1}
            radius={[2, 2, 0, 0]}
            maxBarSize={18}
          />
        )}
        {mode !== 'bars' && (
          <Line
            dataKey={metric}
            type="monotone"
            stroke={teinte}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            tooltipType={mode === 'both' ? 'none' : undefined}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  )
}

/** D'où viennent les subs (demande 2026-10-12) ou le CA (2026-10-15) du jour — seulement si
 *  l'écran fournit la répartition (l'Overview, plusieurs liens cumulés sur l'écran Liens) ; la
 *  modale d'un lien n'a que le total. */
function ByLink({ point, metric, clickable }: { point: MetricPoint; metric: ByLinkMetric; clickable: boolean }) {
  const links = linksFor(point, metric)
  if (!links.length) return null
  const fmt = metric === 'revenue' ? eur : int
  const rest = links.slice(TOOLTIP_LINKS)
  return (
    <span className="mt-1 grid w-full gap-1">
      {links.slice(0, TOOLTIP_LINKS).map((l, i) => (
        <span key={i} className="flex items-baseline justify-between gap-3">
          <span className="max-w-56 truncate">
            {l.name}
            {l.creator && <span className="text-muted-foreground"> · {l.creator}</span>}
          </span>
          <span className="tabular-nums">{fmt(l.value)}</span>
        </span>
      ))}
      {rest.length > 0 && (
        <span className="flex items-baseline justify-between gap-3 text-muted-foreground">
          <span>
            Autres ({rest.length} {rest.length > 1 ? 'liens' : 'lien'})
          </span>
          <span className="tabular-nums">{fmt(rest.reduce((s, l) => s + l.value, 0))}</span>
        </span>
      )}
      {clickable && <span className="mt-1 text-muted-foreground">Clic : tous les liens du jour</span>}
    </span>
  )
}
