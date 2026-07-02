'use client'

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { DailyPoint } from '../types'

const chartConfig = {
  revenue: { label: 'CA', color: 'var(--primary)' },
} satisfies ChartConfig

/**
 * CA quotidien sur la période. L'axe montre tous les jours ; les jours après aujourd'hui
 * ont `revenue: null` → pas de barre (recharts les saute).
 */
export function RevenueChart({
  data,
  periodLabel,
}: {
  data: DailyPoint[]
  periodLabel: string
}) {
  const total = data.reduce((s, d) => s + (d.revenue ?? 0), 0)

  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">
        <CardTitle>CA quotidien</CardTitle>
        <CardDescription>
          {periodLabel} · {Math.round(total).toLocaleString('fr-FR')} € au total
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value: string) =>
                new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
                  }
                  formatter={(value) => (
                    <span className="tabular-nums">{Number(value).toLocaleString('fr-FR')} €</span>
                  )}
                />
              }
            />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
