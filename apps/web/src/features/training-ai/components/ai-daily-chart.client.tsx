'use client'

import { frDayMonthShort } from '@glagency/core'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import type { AiDay } from '../types'

// Le fan et la notation : mêmes teintes que la page Liens du marketing (violet / cyan). Les
// chatteurs : orange de la palette de référence, validé à côté des deux (clair et sombre ; le pas
// sombre est le sien, pas un simple assombrissement automatique).
const config = {
  usdFan: { label: 'Fan', color: '#8b5cf6' },
  usdScore: { label: 'Notation', color: '#06b6d4' },
  chatters: { label: 'Chatteurs', theme: { light: '#eb6834', dark: '#d95926' } },
} satisfies ChartConfig

const usd2 = (n: number) => `${n.toFixed(2)} $`

/**
 * L'infobulle : un jour se lit en entier. Le coût par chatteur est la question que pose la page —
 * la facture monte-t-elle parce qu'il y a plus de monde, ou parce que chacun consomme plus ?
 * Textes en encre neutre, la couleur ne sert qu'à la pastille.
 */
function DayTooltip({ active, payload }: { active?: boolean; payload?: { payload: AiDay }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const rows: { label: string; value: string; color?: string }[] = [
    { label: 'Fan', value: usd2(d.usdFan), color: '#8b5cf6' },
    { label: 'Notation', value: usd2(d.usdScore), color: '#06b6d4' },
    { label: 'Total', value: usd2(d.usd) },
    { label: 'Chatteurs', value: String(d.chatters), color: 'var(--color-chatters, #eb6834)' },
    { label: 'Coût par chatteur', value: d.chatters > 0 ? usd2(d.usd / d.chatters) : '—' },
    // Sessions dans l'infobulle et non en barre : ~1 000 par jour contre ~30 chatteurs, sur la même
    // échelle de droite elles écraseraient la barre des chatteurs.
    { label: 'Sessions', value: d.sessions.toLocaleString('fr-FR') },
    { label: 'Coût par session', value: d.sessions > 0 ? `${(d.usd / d.sessions).toFixed(3)} $` : '—' },
  ]
  return (
    <div className="grid min-w-[11rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{frDayMonthShort(d.day)}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color ? <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: r.color }} /> : <span className="size-2.5 shrink-0" />}
            {r.label}
          </span>
          <span className="font-mono font-medium tabular-nums text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Par jour, DEUX barres côte à côte : le coût (empilé fan + notation — c'est la somme qui est la
 * facture du jour) et le nombre de chatteurs. Demande de Benoit (2026-09-14) : un seul graphique,
 * le coût et les chatteurs du jour l'un à côté de l'autre.
 *
 * Deux unités, donc deux échelles : le coût se lit à GAUCHE (en $), les chatteurs à DROITE (axe
 * titré). Les hauteurs des deux barres ne se comparent pas entre elles — l'infobulle donne le
 * rapport exact (coût par chatteur).
 */
export function AiDailyChart({ days }: { days: AiDay[] }) {
  // La RPC rend le plus récent d'abord ; un graphe se lit de gauche à droite dans le temps.
  const data = [...days].reverse()
  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} barCategoryGap="20%" barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => frDayMonthShort(v)}
        />
        <YAxis yAxisId="usd" tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `${v} $`} />
        <YAxis
          yAxisId="chatters"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={48}
          allowDecimals={false}
          label={{ value: 'chatteurs', angle: 90, position: 'insideRight', className: 'fill-muted-foreground text-xs' }}
        />
        <ChartTooltip cursor={false} content={<DayTooltip />} />
        <Bar yAxisId="usd" dataKey="usdFan" stackId="usd" fill="#8b5cf6" maxBarSize={24} />
        <Bar yAxisId="usd" dataKey="usdScore" stackId="usd" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={24} />
        <Bar yAxisId="chatters" dataKey="chatters" fill="var(--color-chatters)" radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  )
}
