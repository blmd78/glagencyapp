'use client'

import { frDayLong, frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from 'recharts'
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
import { eur } from '@/lib/format'

const chartConfig = {
  revenue: { label: 'CA', color: 'var(--primary)' },
} satisfies ChartConfig

/**
 * CA quotidien sur le(s) mois entier(s) couvrant la période sélectionnée. Les jours hors
 * sélection sont atténués et exclus du total ; les jours après aujourd'hui ont
 * `revenue: null` → pas de barre (recharts les saute).
 */
export function RevenueChart({
  data,
  periodLabel,
  scopeLabel = null,
}: {
  data: DailyPoint[]
  periodLabel: string
  /**
   * Périmètre de la série, accolé au titre (« agence », « vos modèles »). `null` = titre nu :
   * KPI et courbe décrivent le même périmètre, il n'y a rien à lever. Renseigné seulement pour
   * les porteurs d'un bout `overview:*`, chez qui les deux peuvent diverger (cf. 0139).
   */
  scopeLabel?: string | null
}) {
  const total = data.reduce((s, d) => s + (d.inPeriod ? (d.revenue ?? 0) : 0), 0)

  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">
        <CardTitle>CA quotidien{scopeLabel ? ` — ${scopeLabel}` : ''}</CardTitle>
        <CardDescription>
          {periodLabel} · {eur(total)} au total
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
                frDayMonthShort(value)
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  labelFormatter={(value) =>
                    frDayLong(value)
                  }
                  formatter={(value) => (
                    <span className="tabular-nums">{eur(Number(value))}</span>
                  )}
                />
              }
            />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4}>
              {data.map((d) => (
                <Cell key={d.date} fillOpacity={d.inPeriod ? 1 : 0.25} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
