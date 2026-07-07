'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Combobox } from '@/components/ui/combobox'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { modelColor, modelHexColor } from '@/lib/model-color'
import { frDayLong, frDayMonthShort } from '@glagency/core'
import { num } from '@/lib/format'
import type { StatsData } from '../types'

/**
 * Tooltip façon MyPuls : le jour, puis chaque modèle trié par abonnés décroissants,
 * avec ses renouvellements entre parenthèses. L'identité passe par le nom + la
 * pastille couleur (jamais la couleur seule).
 */
function DayTooltip({
  active,
  label,
  data,
  only,
}: {
  active?: boolean
  label?: string
  data: StatsData
  only?: string
}) {
  if (!active || !label) return null
  const day = data.days.find((d) => d.date === label)
  if (!day) return null
  const rows = data.models
    .filter((m) => !only || m.name === only)
    .map((m) => ({ name: m.name, subs: day.subs[m.name] ?? 0, renews: day.renews[m.name] ?? 0 }))
    .filter((r) => r.subs > 0 || r.renews > 0)
    .sort((a, b) => b.subs - a.subs)
  if (!rows.length) return null
  return (
    <div className="min-w-52 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
      <p className="mb-2 text-sm font-semibold">{frDayLong(label)}</p>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-baseline justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: modelHexColor(r.name) }}
              />
              {r.name}
            </span>
            <span className="tabular-nums">
              <b>{num(r.subs)}</b>
              {r.renews > 0 && (
                <span className="text-muted-foreground"> (+{num(r.renews)} renouv.)</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Nouveaux abonnés par jour — barres groupées par modèle, couleurs d'identité de l'app.
 * Filtré sur UN modèle : deux séries (nouveaux + renouvellements, même teinte dont une
 * claire) — en vue globale les renouvellements restent dans le tooltip (lisibilité).
 */
export function SubsChart({ data }: { data: StatsData }) {
  const [model, setModel] = useState<string>('all')
  const filtered = model !== 'all'

  // Lignes recharts : { date, [nomModèle]: subs } — ou { date, nouveaux, renouv } si filtré.
  const chartData = useMemo(
    () =>
      filtered
        ? data.days
            .map((d) => ({ date: d.date, nouveaux: d.subs[model] ?? 0, renouv: d.renews[model] ?? 0 }))
            .filter((d) => d.nouveaux > 0 || d.renouv > 0)
        : data.days.map((d) => ({ date: d.date, ...d.subs })),
    [data.days, filtered, model],
  )

  // Totaux de l'en-tête : recalculés sur le modèle filtré.
  const totals = useMemo(() => {
    if (!filtered) return { nouveaux: data.totalNew, renouv: data.totalRenew }
    let n = 0
    let r = 0
    for (const d of data.days) {
      n += d.subs[model] ?? 0
      r += d.renews[model] ?? 0
    }
    return { nouveaux: n, renouv: r }
  }, [data, filtered, model])

  const hex = filtered ? modelHexColor(model) : ''
  const config = (
    filtered
      ? { nouveaux: { label: 'Nouveaux', color: hex }, renouv: { label: 'Renouv.', color: hex } }
      : Object.fromEntries(
          data.models.map((m) => [m.name, { label: m.name, color: modelHexColor(m.name) }]),
        )
  ) satisfies ChartConfig

  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle>Nouveaux abonnés</CardTitle>
            <CardDescription>{data.period} · par modèle et par jour</CardDescription>
          </div>
          <Badge className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
            {num(totals.nouveaux)} nouveaux
          </Badge>
          <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {num(totals.renouv)} renouv.
          </Badge>
          <Combobox
            value={model}
            onChange={setModel}
            className="h-8 w-44 text-xs"
            searchPlaceholder="Rechercher un modèle…"
            options={[
              { value: 'all', label: 'Tous les modèles' },
              ...data.models.map((m) => ({ value: m.name, label: m.name })),
            ]}
          />
        </div>
        {/* Légende : identité fixe par modèle — ou les deux mesures quand un modèle est filtré. */}
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {filtered ? (
            <>
              <Badge className={modelColor(model)}>{model}</Badge>
              <span className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: hex }} />
                Nouveaux
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: hex, opacity: 0.4 }} />
                Renouvellements
              </span>
            </>
          ) : (
            data.models.map((m) => (
              <Badge key={m.name} className={modelColor(m.name)}>
                {m.name}
              </Badge>
            ))
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6">
        {chartData.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aucune donnée d&apos;abonnés sur cette période.
          </p>
        ) : (
          <ChartContainer key={model} config={config} className="aspect-auto h-[340px] w-full">
            <BarChart data={chartData} barGap={1} barCategoryGap="12%">
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(v: string) =>
                  frDayMonthShort(v)
                }
              />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                content={<DayTooltip data={data} only={filtered ? model : undefined} />}
              />
              {filtered ? (
                [
                  <Bar key="nouveaux" dataKey="nouveaux" fill={hex} radius={[2, 2, 0, 0]} maxBarSize={22} />,
                  <Bar key="renouv" dataKey="renouv" fill={hex} fillOpacity={0.4} radius={[2, 2, 0, 0]} maxBarSize={22} />,
                ]
              ) : (
                data.models.map((m) => (
                  <Bar
                    key={m.name}
                    dataKey={m.name}
                    fill={modelHexColor(m.name)}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={22}
                  />
                ))
              )}
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
