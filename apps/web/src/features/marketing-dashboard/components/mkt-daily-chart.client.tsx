'use client'

import { frDayLong, frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { int } from '@/lib/format'
import type { MktDailyPoint } from '../types'

// Mêmes couleurs que la légende legacy : violet / vert / bleu.
const config = {
  revenue: { label: 'Revenus (€)', color: '#8b5cf6' },
  conversions: { label: 'Subs', color: '#22c55e' },
  clicks: { label: 'Clics', color: '#0ea5e9' },
} satisfies ChartConfig

/**
 * Revenus / subs / clics par jour en BARRES GROUPÉES (même anatomie que le graphe
 * de l'onglet Stats chatteurs) — violet / vert / bleu comme le legacy. Échelle
 * partagée (€ vs comptes) : le tooltip précise l'unité de chaque série.
 */
export function MktDailyChart({ data }: { data: MktDailyPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
      <BarChart data={data} barGap={1} barCategoryGap="18%">
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) =>
            frDayMonthShort(v)
          }
        />
        <YAxis tickLine={false} axisLine={false} width={44} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(v) =>
                frDayLong(v as string)
              }
              formatter={(value, name) => (
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="tabular-nums">
                    {int(Number(value))}
                    {name === 'revenue' ? ' €' : ''}
                  </span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="revenue" fill="#8b5cf6" radius={[2, 2, 0, 0]} maxBarSize={18} />
        <Bar dataKey="conversions" fill="#22c55e" radius={[2, 2, 0, 0]} maxBarSize={18} />
        <Bar dataKey="clicks" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  )
}
