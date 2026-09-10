'use client'

import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { eur } from '@/lib/format'

const chartConfig = { value: { label: 'Valeur' }, rest: { label: 'Reste' } } satisfies ChartConfig

/**
 * Jauge en DEMI-CERCLE (shadcn Radial Chart, 180°) : segment coloré + piste grise jusqu'au
 * repère. Partagée — Santé (LTV d'une modèle contre la cible agence) et Marketing (LTV d'un
 * canal contre la moyenne des liens).
 *
 * `max` est le REPÈRE, pas un plafond d'affichage : la barre sature à `max` mais le chiffre
 * écrit au centre reste la vraie valeur. Sans repère explicite la jauge ne dit rien — c'est
 * pour ça que ce n'est pas une valeur par défaut.
 */
export function LtvGauge({
  value,
  max,
  color,
  caption,
  size = 'lg',
}: {
  value: number | null
  /** Repère de remplissage (la jauge sature ici). */
  max: number
  /** Couleur du segment — statut côté Santé, couleur du canal côté Marketing. */
  color: string
  /** Ligne sous le chiffre (taille `lg` seulement) — ex. « € / abonné ». */
  caption?: string
  size?: 'lg' | 'sm'
}) {
  const borne = Math.max(max, 0.01)
  const rempli = value === null ? 0 : Math.min(Math.max(value, 0), borne)
  const data = [{ value: rempli, rest: borne - rempli }]
  const lg = size === 'lg'
  // Demi-cercle haut : centre polaire posé vers le bas du conteneur (hauteur ≈ 0,62 × largeur).
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
                    {value === null ? '—' : eur(value)}
                  </tspan>
                  {lg && caption && (
                    <tspan x={cx} y={y + 8} className="fill-muted-foreground text-xs">
                      {caption}
                    </tspan>
                  )}
                </text>
              )
            }}
          />
        </PolarRadiusAxis>
        <RadialBar dataKey="value" stackId="gauge" cornerRadius={6} fill={color} />
        <RadialBar dataKey="rest" stackId="gauge" cornerRadius={6} fill="var(--muted)" />
      </RadialBarChart>
    </ChartContainer>
  )
}
