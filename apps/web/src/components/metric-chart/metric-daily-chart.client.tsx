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
import { SERIES, type ChartMode, type Metric, type MetricPoint } from './options'

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
 */
export function MetricDailyChart({
  data,
  metric,
  mode,
  color,
  height = 280,
  showXAxis = true,
}: {
  data: MetricPoint[]
  metric: Metric
  mode: ChartMode
  color?: string
  height?: number
  /** Masqué sur les petits graphes du haut en mode « Tout » : un seul axe des dates, en bas. */
  showXAxis?: boolean
}) {
  const s = SERIES[metric]
  const teinte = color ?? s.color
  const config = { [metric]: { label: s.label, color: teinte } } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={data} barCategoryGap="18%">
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
              formatter={(value) => (
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="tabular-nums">
                    {metric === 'revenue' ? eur(Number(value)) : int(Number(value))}
                  </span>
                </span>
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
