'use client'

import { useState } from 'react'
import { frDateNumeric } from '@glagency/core'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { num } from '@/lib/format'
import { KpiGrid } from '@/components/kpi-card'
import { LinksCard } from './components/links-card'
import { AddAccountDialog, SocialEntryDialog } from './components/social-entry-dialog'
import type { MktLinkRow, MktSocialData, MktSocialRow } from './types'

const signed = (v: number | null) =>
  v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('fr-FR')}`

function makeColumns(platform: 'instagram' | 'twitter'): ColumnDef<MktSocialRow>[] {
  const cols: ColumnDef<MktSocialRow>[] = [
    {
      id: 'handle',
      accessorKey: 'handle',
      header: ({ column }) => <Sortable column={column} label="Compte" />,
      cell: ({ getValue }) => <span className="font-medium">@{getValue() as string}</span>,
    },
    {
      id: 'creator',
      accessorKey: 'creator',
      header: 'Créatrice',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        return v ? <Badge className={modelColor(v)}>{v}</Badge> : <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: 'staff',
      accessorKey: 'staff',
      header: 'VA',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{(getValue() as string | null) ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'followers',
      header: ({ column }) => <Sortable column={column} label="Followers" className="justify-end" />,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return <span className="font-medium tabular-nums">{v != null ? num(v) : '—'}</span>
      },
      meta: { align: 'right' },
    },
    {
      accessorKey: 'deltaFollowers',
      header: ({ column }) => <Sortable column={column} label="Δ période" className="justify-end" />,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return (
          <span
            className={cn(
              'tabular-nums',
              v != null && v > 0 && 'text-green-600 dark:text-green-400',
              v != null && v < 0 && 'text-red-600 dark:text-red-400',
            )}
          >
            {signed(v)}
          </span>
        )
      },
      meta: { align: 'right' },
    },
    {
      accessorKey: 'viewsPeriod',
      header: ({ column }) => <Sortable column={column} label="Vues période" className="justify-end" />,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return <span className="tabular-nums">{v != null && v > 0 ? num(v) : '—'}</span>
      },
      meta: { align: 'right' },
    },
  ]
  if (platform === 'twitter') {
    cols.push({
      accessorKey: 'engagementPeriod',
      header: ({ column }) => <Sortable column={column} label="Engagement" className="justify-end" />,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return <span className="tabular-nums text-muted-foreground">{v != null && v > 0 ? num(v) : '—'}</span>
      },
      meta: { align: 'right' },
    })
  }
  cols.push({
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ getValue }) => {
      const v = (getValue() as string | null) ?? '—'
      return (
        <Badge className={v === 'ok' ? STATUS_COLORS.positive : STATUS_COLORS.neutral}>{v}</Badge>
      )
    },
    meta: { align: 'center' },
  })
  return cols
}

export function MktSocialTemplate({ data, links }: { data: MktSocialData; links: MktLinkRow[] }) {
  const title = data.platform === 'instagram' ? 'Instagram' : 'Twitter / X'
  const ig = data.platform === 'instagram'
  const [tab, setTab] = useState<'comptes' | 'liens'>('comptes')
  const active = data.accounts.filter((a) => a.active)
  const ok = active.filter((a) => a.status === 'ok').length
  const deltaFollowers = active.reduce((s, a) => s + (a.deltaFollowers ?? 0), 0)
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('fr-FR')}`
  const base = { deltaPct: null, trendLabel: '' }
  const kpis = [
    {
      ...base,
      key: 'followers',
      label: 'Followers cumulés',
      value: num(data.totals.followers),
      hint: 'somme du dernier relevé de chaque compte',
      info: ig
        ? 'Photo quotidienne prise par le scrape Apify de chaque nuit (23h35).'
        : 'Dernier relevé saisi par l’équipe (bouton « Saisie du jour »).',
    },
    {
      ...base,
      key: 'delta',
      label: 'Followers gagnés',
      value: signed(deltaFollowers),
      hint: 'sur la période affichée',
      info: 'Somme des variations de followers de chaque compte entre son premier et son dernier relevé de la période.',
    },
    {
      ...base,
      key: 'views',
      label: 'Vues (période)',
      value: num(data.totals.viewsPeriod),
      hint: 'somme des vues 24 h',
      info: ig
        ? 'Somme des « vues 24 h » quotidiennes : différence jour à jour du cumul de vues des ~12 derniers posts de chaque compte (Apify).'
        : 'Somme des « vues 24 h » saisies par l’équipe.',
    },
    {
      ...base,
      key: 'accounts',
      label: 'Comptes sains',
      value: `${ok} / ${active.length}`,
      hint: 'statut ok au dernier relevé',
      info: 'Comptes actifs dont le dernier relevé est « ok » — les autres sont privés, introuvables (bannis/renommés) ou sans relevé.',
    },
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {data.period} · {data.accounts.length} comptes · {num(data.totals.followers)} followers
            cumulés
          </p>
        </div>
        {/* Instagram : collecte automatique (Apify) → pas de saisie manuelle ; Twitter :
            la saisie de l'équipe reste la seule source de données. */}
        {!ig && (
          <div className="ml-auto flex gap-2">
            <AddAccountDialog platform={data.platform} />
            <SocialEntryDialog platform={data.platform} accounts={data.accounts} />
          </div>
        )}
      </div>

      <KpiGrid kpis={kpis} />

      {/* La collecte quotidienne (Apify / API X) n'est pas encore branchée : les relevés
          s'arrêtent au dernier jour du flux Discord legacy. */}
      {data.lastDate && data.lastDate < new Date().toISOString().slice(0, 10) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Dernier relevé : {frDateNumeric(data.lastDate)} — la
          collecte quotidienne sera branchée ({data.platform === 'instagram' ? 'Apify' : 'API X'}).
        </p>
      )}

      {/* Onglets Comptes / Liens : évite l'empilement vertical des deux tables. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'comptes' | 'liens')}>
        <TabsList>
          <TabsTrigger value="comptes">
            Comptes
            <span className="ml-1.5 tabular-nums opacity-60">{data.accounts.length}</span>
          </TabsTrigger>
          <TabsTrigger value="liens">
            Liens
            <span className="ml-1.5 tabular-nums opacity-60">{links.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'comptes' ? (
        <DataTable
          data={data.accounts}
          columns={makeColumns(data.platform)}
          filterColumnId="handle"
          filterPlaceholder="Filtrer par compte…"
          initialSorting={[{ id: 'followers', desc: true }]}
          pageSize={15}
          getRowId={(a) => a.id}
          countLabel={(n) => `${n} compte(s)`}
        />
      ) : (
        <LinksCard links={links} period={data.period} />
      )}
    </div>
  )
}
