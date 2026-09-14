'use client'

import { frDayLong, frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { eur, int } from '@/lib/format'
import type { DailyPoint } from '../daily-series'

// MÊMES couleurs et même anatomie que la courbe de /marketing/overview : les deux écrans
// racontent la même chose à deux échelles, ils doivent se lire de la même façon.
const config = {
  revenueEur: { label: 'Revenus (€)', color: '#8b5cf6' },
  conversions: { label: 'Subs', color: '#22c55e' },
  clicks: { label: 'Clics', color: '#0ea5e9' },
} satisfies ChartConfig

/**
 * Le jour par jour d'UN lien. Échelle partagée entre € et comptes, comme sur l'Overview : au
 * grain d'un lien les trois séries sont du même ordre de grandeur (dizaines), là où le total
 * agence écrase les subs sous les clics. Le tooltip porte l'unité de chaque série.
 */
export function LinkDailyChart({ data }: { data: DailyPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} barGap={1} barCategoryGap="18%">
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
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
              formatter={(value, name) => (
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="tabular-nums">
                    {name === 'revenueEur' ? eur(Number(value)) : int(Number(value))}
                  </span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="revenueEur" fill="#8b5cf6" radius={[2, 2, 0, 0]} maxBarSize={18} />
        <Bar dataKey="conversions" fill="#22c55e" radius={[2, 2, 0, 0]} maxBarSize={18} />
        <Bar dataKey="clicks" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ChartContainer>
  )
}
