'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { frDayMonthShort, frDayLong } from '@glagency/core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { TurnoverData } from '../types'

/**
 * Couleurs alignées sur le sens qu'elles portent ailleurs dans l'app : une arrivée est une bonne
 * nouvelle (vert), un départ appelle l'œil (ambre), l'effectif est un niveau de contexte (bleu
 * primaire, comme le CA d'Overview).
 */
const MOUVEMENTS: ChartConfig = {
  entrees: { label: 'Arrivées', color: 'var(--color-green-500)' },
  sorties: { label: 'Départs', color: 'var(--color-amber-500)' },
}
const EFFECTIF: ChartConfig = {
  effectif: { label: 'Effectif', color: 'var(--primary)' },
}

/** Axe des jours — commun aux deux graphes, pour qu'ils se superposent à la lecture. */
const dayAxis = (
  <XAxis
    dataKey="jour"
    tickLine={false}
    axisLine={false}
    tickMargin={8}
    minTickGap={24}
    tickFormatter={frDayMonthShort}
  />
)

/**
 * Turnover — deux lectures d'une même période, dans une seule carte.
 *
 * DEUX ONGLETS et non deux séries superposées : les arrivées et les départs sont des FLUX qui se
 * comparent l'un à l'autre ; l'effectif est un NIVEAU, sur une échelle sans rapport (95 contre 0-2).
 * Les tracer ensemble écrasait les barres au ras de l'axe. « Arrivées et départs » reste la vue
 * par défaut : c'est le mouvement qu'on vient regarder, l'effectif est le contexte.
 *
 * TOUS LES JOURS DE LA PÉRIODE sont rendus, y compris ceux à zéro (`generate_series` côté RPC,
 * 0101) : un graphe qui ne montre que les jours actifs les colle les uns aux autres et fait lire
 * une activité continue là où il n'y a eu que deux mouvements dans le mois.
 *
 * Écrit avec `ChartContainer`/`ChartTooltip` comme les quatre autres graphes du CRM, et au même
 * grain quotidien que celui des abonnés (`subs-chart`) auquel il s'aligne.
 */
export function TurnoverChart({ data }: { data: TurnoverData }) {
  const vide = data.days.length === 0

  return (
    <Card className="pt-0">
      <Tabs defaultValue="mouvements">
        <CardHeader className="border-b py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Turnover</CardTitle>
              <CardDescription>Chatteurs, jour par jour sur la période</CardDescription>
            </div>
            <TabsList>
              <TabsTrigger value="mouvements">Arrivées et départs</TabsTrigger>
              <TabsTrigger value="effectif">Effectif</TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>

        <CardContent className="px-2 pt-4 sm:px-6">
          {vide ? (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucune donnée sur cette période.
            </p>
          ) : (
            <>
              <TabsContent value="mouvements">
                <ChartContainer config={MOUVEMENTS} className="aspect-auto h-[260px] w-full">
                  <BarChart data={data.days} barGap={2} barCategoryGap="20%">
                    <CartesianGrid vertical={false} />
                    {dayAxis}
                    <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <ChartTooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      content={<ChartTooltipContent labelFormatter={(v) => frDayLong(String(v))} />}
                    />
                    <Bar dataKey="entrees" fill="var(--color-entrees)" radius={[2, 2, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="sorties" fill="var(--color-sorties)" radius={[2, 2, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ChartContainer>
              </TabsContent>

              <TabsContent value="effectif">
                <ChartContainer config={EFFECTIF} className="aspect-auto h-[260px] w-full">
                  {/* Aire et non barres : un effectif est continu d'un jour au suivant — des barres
                      suggéreraient un comptage indépendant chaque jour. */}
                  <AreaChart data={data.days}>
                    <CartesianGrid vertical={false} />
                    {dayAxis}
                    <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <ChartTooltip
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                      content={<ChartTooltipContent labelFormatter={(v) => frDayLong(String(v))} />}
                    />
                    <Area
                      type="monotone"
                      dataKey="effectif"
                      stroke="var(--color-effectif)"
                      fill="var(--color-effectif)"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              </TabsContent>
            </>
          )}
        </CardContent>
      </Tabs>
    </Card>
  )
}
