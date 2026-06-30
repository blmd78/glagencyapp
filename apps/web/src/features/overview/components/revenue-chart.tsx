'use client'

import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { DailyPoint } from '../types'

const chartConfig = {
  revenue: { label: 'CA', color: 'var(--primary)' },
} satisfies ChartConfig

type Range = '90d' | '30d' | '7d'

export function RevenueChart({ data }: { data: DailyPoint[] }) {
  const [range, setRange] = React.useState<Range>('90d')
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const filtered = data.slice(-days)

  return (
    <Card className="pt-0">
      <CardHeader className="flex flex-col items-stretch gap-3 border-b py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1">
          <CardTitle>CA quotidien</CardTitle>
          <CardDescription>
            Total sur les {days} derniers jours
          </CardDescription>
        </div>
        <ToggleGroup
          type="single"
          value={range}
          onValueChange={(v) => v && setRange(v as Range)}
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
        >
          <ToggleGroupItem value="90d">3 mois</ToggleGroupItem>
          <ToggleGroupItem value="30d">30 jours</ToggleGroupItem>
          <ToggleGroupItem value="7d">7 jours</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[300px] w-full"
        >
          <AreaChart data={filtered}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.08}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value: string) =>
                new Date(value).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                    })
                  }
                  formatter={(value) => (
                    <span className="tabular-nums">
                      {Number(value).toLocaleString('fr-FR')} €
                    </span>
                  )}
                />
              }
            />
            <Area
              dataKey="revenue"
              type="natural"
              fill="url(#fillRevenue)"
              stroke="var(--color-revenue)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
