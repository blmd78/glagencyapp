'use client'

import { frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { AiDay } from '../types'

// Deux séries seulement : le fan et la notation. Mêmes teintes que la page Liens du marketing
// (violet / cyan), passées au validateur dataviz — séparées en vision normale comme sous
// deutéranopie.
const config = {
  usdFan: { label: 'Fan', color: '#8b5cf6' },
  usdScore: { label: 'Notation', color: '#06b6d4' },
} satisfies ChartConfig

const usd2 = (n: number) => `${n.toFixed(2)} $`

/**
 * Le coût par jour, EMPILÉ par sorte d'appel : d'un coup d'œil on voit lequel des deux moteurs
 * porte la dépense, et si un pic vient du fan (volume de messages) ou de la notation (nombre de
 * sessions terminées). Empilé et non groupé : c'est la somme qui est la facture du jour.
 */
export function AiDailyChart({ days }: { days: AiDay[] }) {
  // La RPC rend le plus récent d'abord ; un graphe se lit de gauche à droite dans le temps.
  const data = [...days].reverse()
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} barCategoryGap="20%">
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => frDayMonthShort(v)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => `${v} $`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name) => (
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="tabular-nums">{usd2(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="usdFan" stackId="usd" fill="#8b5cf6" maxBarSize={28} />
        <Bar dataKey="usdScore" stackId="usd" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  )
}
