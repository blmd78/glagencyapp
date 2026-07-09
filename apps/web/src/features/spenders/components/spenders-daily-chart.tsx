'use client'

import { frDayLong, frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { SpenderDailyPoint } from '../types'

const config = {
  ca: { label: 'CA spenders (€)', color: '#8b5cf6' },
} satisfies ChartConfig

/** Évolution du CA capté auprès des spenders, jour par jour (tout l'historique scrapé). */
export function SpendersDailyChart({ data }: { data: SpenderDailyPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <BarChart data={data} barCategoryGap="18%">
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => frDayMonthShort(v)}
        />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(v) => frDayLong(v as string)}
              formatter={(value) => (
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">CA spenders</span>
                  <span className="tabular-nums">
                    {Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                  </span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="ca" fill="#8b5cf6" radius={[2, 2, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  )
}
