'use client'

import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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
import type { ChatterActivity } from '@glagency/mypuls/shifts'
import { int } from '@/lib/format'

const chartConfig = {
  messages: { label: 'Messages', color: 'var(--primary)' },
} satisfies ChartConfig

/**
 * L'activité minute par minute d'une journée, telle que MyPuls la mesure : un point par minute,
 * le nombre de messages envoyés.
 *
 * ~1 740 points sur une nuit complète. On n'échantillonne PAS : c'est justement la granularité
 * qui rend un rythme mécanique visible à l'œil — le seul contrôle anti-automate qui reste
 * depuis que la mesure du poste de travail a disparu.
 *
 * Une graduation toutes les 60 minutes : une étiquette par minute serait illisible.
 */
export function MinuteChart({ activity }: { activity: ChatterActivity }) {
  const data = useMemo(
    () =>
      activity.series.labels.map((label, i) => ({
        label,
        messages: activity.series.values[i] ?? 0,
      })),
    [activity],
  )

  const total = data.reduce((s, d) => s + d.messages, 0)
  const activeMinutes = data.filter((d) => d.messages > 0).length

  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Activité minute par minute</CardTitle>
        <CardDescription>
          {int(total)} message(s) sur {int(activeMinutes)} minute(s) porteuse(s)
          {activity.pauses && <> · {activity.pauses}</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
          <AreaChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={48}
              interval={59}
            />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent labelKey="label" />} />
            <Area
              dataKey="messages"
              type="step"
              stroke="var(--color-messages)"
              fill="var(--color-messages)"
              fillOpacity={0.2}
              // Points désactivés : 1 740 cercles SVG feraient ramer le rendu pour rien.
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
