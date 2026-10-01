'use client'

import { frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { TraficDay } from '../types'

// Mêmes teintes que la page Liens du marketing (violet / cyan).
const config = {
  visitors: { label: 'Visiteurs', color: '#8b5cf6' },
  mymClicks: { label: 'Clics MYM', color: '#06b6d4' },
} satisfies ChartConfig

/** Par jour, deux barres côte à côte : les visiteurs et les clics vers MYM (même unité, même axe). */
export function TraficChart({ days }: { days: TraficDay[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={days} barCategoryGap="20%" barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => frDayMonthShort(v)}
        />
        <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(v) => frDayMonthShort(String(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="visitors" fill="var(--color-visitors)" radius={[3, 3, 0, 0]} maxBarSize={24} />
        <Bar dataKey="mymClicks" fill="var(--color-mymClicks)" radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  )
}
