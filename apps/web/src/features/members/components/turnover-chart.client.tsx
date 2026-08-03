'use client'

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { TurnoverData } from '../types'

const MOIS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

/** '2026-08' → 'août 26'. Le mois seul suffit en abscisse ; l'année évite l'ambiguïté sur 12 mois. */
const moisLabel = (iso: string) => {
  const [y, m] = iso.split('-')
  return `${MOIS_FR[Number(m) - 1]} ${y.slice(2)}`
}

/**
 * Couleurs alignées sur le sens qu'elles ont ailleurs dans l'app : une arrivée est une bonne
 * nouvelle (vert, `STATUS_COLORS.positive`), un départ appelle l'œil (ambre, `.warning`), et
 * l'effectif est une donnée de contexte (gris).
 */
const config = {
  entrees: { label: 'Arrivées', color: 'var(--color-green-500)' },
  sorties: { label: 'Départs', color: 'var(--color-amber-500)' },
  effectif: { label: 'Effectif', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

/**
 * Arrivées, départs et effectif par mois.
 *
 * `ComposedChart` et non `BarChart` : les deux premières séries se comparent (des barres côte à
 * côte), la troisième est un NIVEAU et non un flux — la tracer en barre l'aurait mise en
 * concurrence visuelle avec les deux autres alors qu'elle se lit sur un autre axe. D'où la ligne,
 * sur un axe droit dédié.
 *
 * Écrit avec `ChartContainer`/`ChartTooltip` comme les quatre autres graphes du CRM (Overview,
 * Stats, Health, Marketing) : mêmes axes sans ligne, même grille horizontale seule, même tooltip.
 * Une implémentation maison en `div` aurait détonné à côté d'eux — et n'aurait rien économisé,
 * recharts étant déjà dans le bundle.
 */
export function TurnoverChart({ data }: { data: TurnoverData }) {
  const chartData = data.months.map((m) => ({
    mois: moisLabel(m.mois),
    entrees: m.entrees,
    sorties: m.sorties,
    effectif: m.effectif,
  }))

  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">
        <CardTitle>Arrivées et départs</CardTitle>
        <CardDescription>Par mois, avec l’effectif de fin de mois</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6">
        {chartData.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aucun mouvement sur cette période.
          </p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
            <ComposedChart data={chartData} barGap={2} barCategoryGap="20%">
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mois" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
              <YAxis
                yAxisId="effectif"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={32}
                allowDecimals={false}
              />
              <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<ChartTooltipContent />} />
              <Bar dataKey="entrees" fill="var(--color-entrees)" radius={[2, 2, 0, 0]} maxBarSize={28} />
              <Bar dataKey="sorties" fill="var(--color-sorties)" radius={[2, 2, 0, 0]} maxBarSize={28} />
              <Line
                yAxisId="effectif"
                type="monotone"
                dataKey="effectif"
                stroke="var(--color-effectif)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
