'use client'

import { useState, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MetricDailyChart } from './metric-daily-chart'
import { METRICS, SERIES, type ChartMode, type Metric, type MetricPoint } from './options'

type Vue = Metric | 'all'

const TITRES: Record<Vue, string> = {
  revenue: 'Revenus / jour',
  conversions: 'Subs / jour',
  clicks: 'Clics / jour',
  all: 'Revenus, subs et clics / jour',
}

/**
 * Le graphe par jour du pôle marketing, avec ses deux réglages (demande Benoit 2026-09-23) : la
 * MÉTRIQUE (onglets, Revenus par défaut) et le RENDU (barres, courbe ou les deux, « les deux »
 * par défaut). PARTAGÉ par l'Overview, le mode Graphique des Liens et la modale d'un lien : les
 * trois montrent la même chose, ils ne doivent pas diverger.
 *
 * `identity` habille le graphe quand la sélection n'a qu'un réseau : sa pastille et son nom en
 * tête du titre, sa couleur sur les barres et la courbe. Sans ça, choisir « Instagram » donnait
 * le même graphe violet que tout le reste — on ne savait plus ce qu'on regardait.
 *
 * État LOCAL et non dans l'URL : c'est une préférence de lecture, pas une vue qu'on partage —
 * même choix que le critère de classement de l'écran Liens.
 *
 * Composition reprise de `members/turnover-chart.client.tsx` (titre à gauche, contrôles à
 * droite dans l'en-tête), onglets = `Tabs` comme le critère des Liens, bascule = `ToggleGroup`
 * comme le grain du Relevé (`report-filters.tsx`). `bare` : sans la carte, pour une modale.
 */
export function MetricDailyPanel({
  daily,
  subtitle,
  identity,
  bare,
}: {
  daily: MetricPoint[]
  subtitle: ReactNode
  identity?: { label: string; color: string } | null
  bare?: boolean
}) {
  const [vue, setVue] = useState<Vue>('revenue')
  const [mode, setMode] = useState<ChartMode>('both')
  const color = identity?.color

  const entete = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {identity && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: identity.color }} />
              {identity.label}
              <span className="text-muted-foreground">·</span>
            </span>
          )}
          {TITRES[vue]}
        </CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={vue} onValueChange={(v) => setVue(v as Vue)}>
          <TabsList>
            <TabsTrigger value="all">Tout</TabsTrigger>
            {METRICS.map((m) => (
              <TabsTrigger key={m} value={m}>
                {SERIES[m].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <ToggleGroup
          type="single"
          value={mode}
          // `onValueChange` rend '' quand on re-clique l'option active : on l'ignore, sinon la
          // bascule se viderait (même garde que `report-filters.tsx`).
          onValueChange={(v) => {
            if (v) setMode(v as ChartMode)
          }}
          className="rounded-md border p-0.5"
        >
          <ToggleGroupItem value="bars" className="px-3 text-sm">
            Barres
          </ToggleGroupItem>
          <ToggleGroupItem value="line" className="px-3 text-sm">
            Courbe
          </ToggleGroupItem>
          <ToggleGroupItem value="both" className="px-3 text-sm">
            Les deux
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )

  const corps = !daily.length ? (
    <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      Aucune donnée sur cette période.
    </p>
  ) : vue === 'all' ? (
    // « Tout » en petits graphes EMPILÉS, chacun sur son échelle : sur un axe commun, les clics
    // (≈ 3 300 / jour) écrasent les abonnés (≈ 260) et les revenus (≈ 800 €).
    <div className="flex flex-col gap-4">
      {METRICS.map((m, i) => (
        <div key={m} className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: color ?? SERIES[m].color }} />
            {SERIES[m].label}
          </span>
          <MetricDailyChart
            data={daily}
            metric={m}
            mode={mode}
            color={color}
            height={140}
            showXAxis={i === METRICS.length - 1}
          />
        </div>
      ))}
    </div>
  ) : (
    <MetricDailyChart data={daily} metric={vue} mode={mode} color={color} />
  )

  if (bare) {
    return (
      <div className="flex flex-col gap-4">
        {entete}
        {corps}
      </div>
    )
  }
  return (
    <Card className="pt-0">
      <CardHeader className="border-b py-5">{entete}</CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6">{corps}</CardContent>
    </Card>
  )
}
