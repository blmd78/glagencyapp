'use client'

import { frDayLong, frDayMonthShort } from '@glagency/core'
import { Area, AreaChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { eur, num, pct } from '@/lib/format'
import type { MktModelesData } from '../types'

// DEUX couleurs sur toute la page. Le violet est déjà la teinte « revenus » du pôle
// (mkt-daily-chart.client.tsx) ; le neutre passe par le token shadcn pour suivre le thème
// sombre — un gris en dur resterait clair sur fond noir.
const VIA = '#8b5cf6'
const RESTE = 'var(--muted)'

const donutConfig = {
  via: { label: 'Via liens', color: VIA },
  reste: { label: 'Hors tracking', color: RESTE },
} satisfies ChartConfig

const courbeConfig = {
  part: { label: 'Part des abonnés via liens', color: VIA },
} satisfies ChartConfig

/**
 * Un anneau à DEUX parts : ce qui vient des liens, le reste. Deux parts et pas douze — c'est
 * la limite au-delà de laquelle un camembert cesse d'être lisible, et la palette par modèle du
 * projet échoue de toute façon au test de séparation CVD (cf. spec §4.3).
 *
 * `part === null` (dénominateur nul) ne rend PAS l'anneau : un cercle plein gris se lirait
 * « 0 % », alors qu'il n'y a simplement rien à rapporter.
 */
function Donut({
  titre,
  part,
  valeur,
  total,
  format,
  labelVia,
  labelReste,
}: {
  titre: string
  part: number | null
  valeur: number
  total: number
  format: (n: number) => string
  labelVia: string
  labelReste: string
}) {
  const reste = Math.max(total - valeur, 0)
  return (
    <Card>
      <CardHeader>
        <CardDescription>{titre}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">
          {part === null ? '—' : pct(part)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {part === null ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Rien à rapporter sur cette période.
          </p>
        ) : (
          <ChartContainer config={donutConfig} className="mx-auto aspect-square h-[180px]">
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(v, name) => (
                      <span className="flex w-full items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">
                          {name === 'via' ? labelVia : labelReste}
                        </span>
                        <span className="tabular-nums">{format(Number(v))}</span>
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={[
                  { key: 'via', value: valeur },
                  { key: 'reste', value: reste },
                ]}
                dataKey="value"
                nameKey="key"
                innerRadius={58}
                outerRadius={84}
                // 2 px de fond entre les segments : l'écart qui les sépare sans trait.
                paddingAngle={2}
                strokeWidth={0}
              >
                <Cell fill={VIA} />
                <Cell fill={RESTE} />
                <Label
                  content={({ viewBox }) =>
                    viewBox && 'cx' in viewBox && 'cy' in viewBox ? (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan className="fill-foreground text-lg font-semibold tabular-nums">
                          {format(valeur)}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 20}
                          className="fill-muted-foreground text-xs"
                        >
                          {labelVia}
                        </tspan>
                      </text>
                    ) : null
                  }
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
        {/* Les valeurs en toutes lettres : l'identité d'une part n'est jamais portée par
            la seule couleur. */}
        <div className="mt-2 flex items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: VIA }} />
            <span className="text-muted-foreground">{labelVia}</span>
            <span className="font-medium tabular-nums">{format(valeur)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: RESTE }} />
            <span className="text-muted-foreground">{labelReste}</span>
            <span className="font-medium tabular-nums">{format(reste)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Le bandeau d'agence : deux anneaux (abonnés, CA) et la courbe de la part jour par jour.
 *
 * La courbe est le seul angle que l'Overview ne montre pas : lui donne le CA des liens en
 * ABSOLU, ici c'est la part qu'ils représentent — un pôle peut gagner plus en pesant moins.
 */
export function MktAgencySplit({ data }: { data: MktModelesData }) {
  const t = data.totals
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Donut
          titre="Nouveaux abonnés venus d'un lien"
          part={t.partSubs}
          valeur={t.subsLiens}
          total={t.newSubs}
          format={num}
          labelVia="via liens"
          labelReste="hors tracking"
        />
        <Donut
          titre="CA venu d'un lien"
          part={t.partCa}
          valeur={t.caLiens}
          total={t.caTotal}
          format={eur}
          labelVia="via liens"
          labelReste="hors tracking"
        />
      </div>

      {data.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardDescription>Part des nouveaux abonnés venus d&apos;un lien, jour par jour</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={courbeConfig} className="aspect-auto h-[220px] w-full">
              <AreaChart data={data.daily}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(v: string) => frDayMonthShort(v)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => `${v} %`}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(v) => frDayLong(v as string)}
                      formatter={(value) => (
                        <span className="flex w-full items-baseline justify-between gap-3">
                          <span className="text-muted-foreground">Via liens</span>
                          <span className="tabular-nums">{pct(Number(value))}</span>
                        </span>
                      )}
                    />
                  }
                />
                {/* connectNulls={false} : un jour sans nouvel abonné a `part: null` et doit
                    faire un TROU. Relier par-dessus inventerait une continuité ; tomber à 0
                    se lirait comme un effondrement. */}
                <Area
                  dataKey="part"
                  type="monotone"
                  stroke={VIA}
                  fill={VIA}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  connectNulls={false}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
