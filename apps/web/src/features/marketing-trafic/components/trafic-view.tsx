'use client'

import { useState, type ReactNode } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { LS_FLAG_LABEL, LS_PLATFORM_LABEL, addDays, botShare, clickRate, frDateNumeric } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { KpiGrid, type Kpi } from '@/components/kpi-card'
import { num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { STATUS_COLORS } from '@/lib/status-color'
import { modelColor } from '@/lib/model-color'
import { todayLocal } from '@/lib/dates-client'
import { TraficChart } from './trafic-chart.client'
import { TONE_TEXT, botTone, deltaTone, flagTone, platformBadge, type TraficTone } from '../tones'
import type { LsPlatform } from '@glagency/core'
import type { TraficData, TraficRow, TraficTab } from '../types'

const rate2 = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)} %`)
const signedPct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v)} %`)

function kpi(
  key: string,
  label: string,
  cur: number | null,
  prev: number | null,
  fmt: (n: number) => string,
  info: string,
  withDelta = true,
): Kpi {
  return {
    key,
    label,
    value: cur == null ? '—' : fmt(cur),
    deltaPct: withDelta && cur != null && prev ? Math.round(((cur - prev) / prev) * 100) : null,
    trendLabel: 'vs période précédente',
    hint: `période précédente : ${prev == null ? '—' : fmt(prev)}`,
    info,
  }
}

/** Colonne chiffrée triable, alignée à droite ; `tone` colore le chiffre (hausse, baisse, alerte). */
function numCol(
  id: string,
  label: string,
  value: (r: TraficRow) => number,
  show: (r: TraficRow) => string,
  tone?: (r: TraficRow) => TraficTone | null,
): ColumnDef<TraficRow> {
  return {
    id,
    accessorFn: value,
    header: ({ column }) => <Sortable column={column} label={label} className="justify-end" />,
    cell: ({ row }) => {
      const t = tone?.(row.original)
      return <span className={cn('tabular-nums', t && TONE_TEXT[t])}>{show(row.original)}</span>
    },
    meta: { align: 'right' },
  }
}

/** Modèle et réseau en badges, aux couleurs du reste du marketing (Liens tracking). */
const ModelBadge = ({ name }: { name: string | null }) =>
  name ? <Badge className={modelColor(name)}>{name}</Badge> : <span className="text-muted-foreground">Non attribuée</span>
const PlatformBadge = ({ platform }: { platform: LsPlatform | null }) =>
  platform ? <Badge className={platformBadge(platform)}>{LS_PLATFORM_LABEL[platform]}</Badge> : null

/** Le libellé d'une ligne : badge pour une modèle ou un réseau, texte pour un profil ou un lien. */
function LabelCell({ row, tab }: { row: TraficRow; tab: TraficTab }) {
  const label =
    tab === 'modeles' ? (
      <ModelBadge name={row.key === 'none' ? null : row.label} />
    ) : tab === 'reseaux' ? (
      <PlatformBadge platform={row.platform} />
    ) : (
      <span className="font-medium">{row.label}</span>
    )
  return (
    <div className="min-w-0">
      {label}
      {row.sub && <span className="block truncate text-xs text-muted-foreground">{row.sub}</span>}
    </div>
  )
}

export function makeColumns(tab: TraficTab, edit: ((r: TraficRow) => ReactNode) | null): ColumnDef<TraficRow>[] {
  const cols: ColumnDef<TraficRow>[] = [
    {
      accessorKey: 'label',
      header: { profils: 'Profil', modeles: 'Modèle', reseaux: 'Réseau', liens: 'Lien' }[tab],
      cell: ({ row }) => <LabelCell row={row.original} tab={tab} />,
    },
  ]
  if (tab === 'liens') {
    cols.push({
      id: 'modele',
      accessorFn: (r) => r.creatorName ?? '',
      header: ({ column }) => <Sortable column={column} label="Modèle" />,
      cell: ({ row }) => <ModelBadge name={row.original.creatorName} />,
    })
  }
  if (tab === 'liens' || tab === 'profils') {
    cols.push({
      id: 'reseau',
      accessorFn: (r) => (r.platform ? LS_PLATFORM_LABEL[r.platform] : ''),
      header: 'Réseau',
      cell: ({ row }) => <PlatformBadge platform={row.original.platform} />,
    })
  }
  cols.push(
    numCol('visitors', 'Visiteurs', (r) => r.cur.visitors, (r) => num(r.cur.visitors)),
    numCol('delta', 'Évol.', (r) => r.deltaPct ?? Number.NEGATIVE_INFINITY, (r) => signedPct(r.deltaPct), (r) => deltaTone(r.deltaPct)),
    numCol('mym', 'Clics MYM', (r) => r.cur.mymClicks ?? -1, (r) => (r.cur.mymClicks == null ? '—' : num(r.cur.mymClicks))),
    numCol('rate', 'Clics / visiteur', (r) => r.rate ?? -1, (r) => rate2(r.rate)),
    numCol('bots', '% bots', (r) => r.botShare ?? -1, (r) => pct(r.botShare), (r) => botTone(r.botShare)),
    {
      id: 'flags',
      header: 'À regarder',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.flags.map((f) => (
            <Badge key={f} className={STATUS_COLORS[flagTone(f)]}>
              {LS_FLAG_LABEL[f]}
            </Badge>
          ))}
        </div>
      ),
    },
  )
  if (edit) cols.push({ id: 'edit', header: '', cell: ({ row }) => edit(row.original) })
  return cols
}

export function TraficView({
  data,
  editCell = null,
}: {
  data: TraficData
  /** Rendu de la colonne de correction (onglet Liens) ; null = lecture seule. */
  editCell?: ((r: TraficRow) => ReactNode) | null
}) {
  const [tab, setTab] = useState<TraficTab>('profils')
  const rows = { profils: data.profiles, modeles: data.models, reseaux: data.networks, liens: data.links }[tab]
  const { cur, prev } = data.totals
  const kpis: Kpi[] = [
    kpi('visitors', 'Visiteurs', cur.visitors, prev.visitors, num, 'Visiteurs humains uniques par jour, additionnés, bots exclus (LinkScale).'),
    kpi('mym', 'Clics MYM', cur.mymClicks, prev.mymClicks, num, 'Clics sur les boutons qui mènent à mym.fans, sur les pages LinkScale à boutons.'),
    kpi(
      'rate',
      'Clics MYM par visiteur',
      clickRate(cur),
      clickRate(prev),
      (n) => rate2(n),
      'Clics MYM ÷ visiteurs des pages à boutons (redirections exclues). Peut dépasser 1 : un visiteur clique parfois deux fois.',
    ),
    kpi('bots', 'Part de bots', botShare(cur), botShare(prev), (n) => pct(n), 'Bots filtrés par LinkScale ÷ toutes les visites.', false),
  ]
  // Le relevé de 23h05 UTC écrit J-2 et J-1 (Paris) : au-delà de J-2, une nuit a sauté.
  const expected = addDays(todayLocal(), -2)
  const late = data.lastDate != null && data.to >= expected && data.lastDate < expected

  return (
    <>
      <KpiGrid kpis={kpis} />

      {data.lastDate == null ? (
        <p className="text-sm text-muted-foreground">Aucun relevé LinkScale sur la période.</p>
      ) : (
        late && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            Dernier relevé LinkScale : {frDateNumeric(data.lastDate)} — le relevé tourne chaque nuit ; un retard signale
            un souci (clé API LinkScale).
          </p>
        )
      )}

      {data.daily.length > 0 && <TraficChart days={data.daily} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TraficTab)}>
        <TabsList>
          <TabsTrigger value="profils">Profils</TabsTrigger>
          <TabsTrigger value="modeles">Modèles</TabsTrigger>
          <TabsTrigger value="reseaux">Réseaux</TabsTrigger>
          <TabsTrigger value="liens">Liens</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        key={tab}
        data={rows}
        columns={makeColumns(tab, tab === 'liens' ? editCell : null)}
        filterColumnId="label"
        filterPlaceholder="Filtrer…"
        pageSize={20}
        getRowId={(r) => r.key}
        countLabel={(n) => `${n} ligne(s)`}
      />
    </>
  )
}
