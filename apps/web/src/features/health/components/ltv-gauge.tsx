'use client'

import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import type { LtvStatus } from '../types'

// Couleurs de statut (tailwind emerald/amber/red 500) — recharts exige un fill littéral.
const FILL: Record<LtvStatus, string> = {
  sain: '#10b981',
  moyen: '#f59e0b',
  critique: '#ef4444',
}

const chartConfig = { ltv: { label: 'LTV' }, rest: { label: 'Reste' } } satisfies ChartConfig

/**
 * Jauge LTV — shadcn Radial Chart (stacked, demi-cercle 180°) : segment coloré selon le
 * statut + piste grise jusqu'à ~120 % de la cible (une LTV ≥ 12 € sature la jauge).
 */
export function LtvGauge({
  ltv,
  status,
  target,
  size = 'lg',
}: {
  ltv: number | null
  status: LtvStatus | null
  target: number
  size?: 'lg' | 'sm'
}) {
  const max = target * 1.2
  const value = ltv === null ? 0 : Math.min(ltv, max)
  const data = [{ ltv: value, rest: max - value }]
  const lg = size === 'lg'
  // Demi-cercle haut : centre polaire posé vers le bas du conteneur (hauteur ≈ 0.62 × largeur).
  const w = lg ? 180 : 96
  const h = lg ? 112 : 60
  const cy = lg ? 96 : 50

  return (
    <ChartContainer config={chartConfig} className="mx-auto" style={{ width: w, height: h }}>
      <RadialBarChart
        data={data}
        startAngle={180}
        endAngle={0}
        cy={cy}
        innerRadius={lg ? 62 : 32}
        outerRadius={lg ? 84 : 46}
      >
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !('cx' in viewBox)) return null
              const { cx, cy: y } = viewBox as { cx: number; cy: number }
              return (
                <text x={cx} y={y} textAnchor="middle">
                  <tspan
                    x={cx}
                    y={lg ? y - 12 : y - 4}
                    className={
                      lg
                        ? 'fill-foreground text-2xl font-semibold tabular-nums'
                        : 'fill-foreground text-sm font-semibold tabular-nums'
                    }
                  >
                    {ltv === null
                      ? '—'
                      : `${ltv.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} €`}
                  </tspan>
                  {lg && (
                    <tspan x={cx} y={y + 8} className="fill-muted-foreground text-xs">
                      € / new sub
                    </tspan>
                  )}
                </text>
              )
            }}
          />
        </PolarRadiusAxis>
        <RadialBar
          dataKey="ltv"
          stackId="gauge"
          cornerRadius={6}
          fill={status ? FILL[status] : 'var(--muted)'}
        />
        <RadialBar dataKey="rest" stackId="gauge" cornerRadius={6} fill="var(--muted)" />
      </RadialBarChart>
    </ChartContainer>
  )
}
