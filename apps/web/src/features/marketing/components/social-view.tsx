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
import { LinksCard } from './links-card'
import type { MktLinkRow, MktSocialData, MktSocialRow } from '../types'

const signed = (v: number | null) =>
  v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('fr-FR')}`

function makeColumns(platform: 'instagram' | 'twitter' | 'telegram'): ColumnDef<MktSocialRow>[] {
  const cols: ColumnDef<MktSocialRow>[] = [
    {
      id: 'handle',
      accessorKey: 'handle',
      header: ({ column }) => (
        <Sortable column={column} label={platform === 'telegram' ? 'Canal' : 'Compte'} />
      ),
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
      header: ({ column }) => (
        <Sortable
          column={column}
          label={platform === 'telegram' ? 'Membres' : 'Followers'}
          className="justify-end"
        />
      ),
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

export function SocialView({ data, links }: { data: MktSocialData; links: MktLinkRow[] }) {
  const ig = data.platform === 'instagram'
  const tg = data.platform === 'telegram'
  const person = tg ? 'Membres' : 'Followers'
  const unit = tg ? 'canaux' : 'comptes'
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
      label: `${person} cumulés`,
      value: num(data.totals.followers),
      hint: `somme du dernier relevé de chaque ${tg ? 'canal' : 'compte'}`,
      info: ig
        ? 'Photo quotidienne prise par le scrape Apify de chaque nuit (23h35).'
        : 'Dernier relevé saisi par l’équipe (bouton « Saisie du jour »).',
    },
    {
      ...base,
      key: 'delta',
      label: `${person} gagnés`,
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
      label: tg ? 'Canaux sains' : 'Comptes sains',
      value: `${ok} / ${active.length}`,
      hint: 'statut ok au dernier relevé',
      info: 'Comptes actifs dont le dernier relevé est « ok » — les autres sont privés, introuvables (bannis/renommés) ou sans relevé.',
    },
  ]
  return (
    <>
      <KpiGrid kpis={kpis} />

      {/* La collecte quotidienne (Apify / API X) n'est pas encore branchée : les relevés
          s'arrêtent au dernier jour du flux Discord legacy. */}
      {data.lastDate && data.lastDate < new Date().toISOString().slice(0, 10) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Dernier relevé : {frDateNumeric(data.lastDate)} —{' '}
          {ig ? 'la collecte Apify tourne chaque nuit.' : 'pense à la saisie du jour.'}
        </p>
      )}

      {/* Onglets Comptes / Liens : évite l'empilement vertical des deux tables. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'comptes' | 'liens')}>
        <TabsList>
          <TabsTrigger value="comptes">
            {tg ? 'Canaux' : 'Comptes'}
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
          countLabel={(n) => (tg ? `${n} canal/aux` : `${n} compte(s)`)}
        />
      ) : (
        <LinksCard links={links} period={data.period} />
      )}
    </>
  )
}
