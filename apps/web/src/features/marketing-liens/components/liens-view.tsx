'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, num } from '@/lib/format'
import { KpiGrid } from '@/components/kpi-card'
import { setLinkType } from '../actions'
import { typeBadge } from '@/lib/type-badge'
import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktLinksData } from '../types'

const TYPE_LABELS = { twitter: 'Twitter', instagram: 'Instagram', telegram: 'Telegram', other: 'Autre' } as const

/** Sélecteur de type inline (correction manuelle — remplace link_type_overrides legacy). */
function TypeCell({ link }: { link: MktLinkRow }) {
  const [, startTransition] = useTransition()
  return (
    <Select
      value={link.type}
      onValueChange={(t) =>
        startTransition(async () => {
          const res = await setLinkType({ linkId: link.id, type: t })
          if (!res.success) toast.error(`${link.name} : type non modifié — ${res.error}`)
        })
      }
    >
      <SelectTrigger className="h-7 w-32 border-0 bg-transparent shadow-none">
        <SelectValue asChild>
          <Badge className={typeBadge(link.type)}>{TYPE_LABELS[link.type]}</Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(['twitter', 'instagram', 'telegram', 'other'] as const).map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            {TYPE_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const columns: ColumnDef<MktLinkRow>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }) => <Sortable column={column} label="Lien" />,
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.name}</div>
        {row.original.url && (
          <div className="truncate text-xs text-muted-foreground">{row.original.url}</div>
        )}
      </div>
    ),
  },
  {
    id: 'type',
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => <TypeCell link={row.original} />,
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
    accessorKey: 'clicks',
    header: ({ column }) => <Sortable column={column} label="Clics" className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'conversions',
    header: ({ column }) => <Sortable column={column} label="Subs" className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{num(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'taux',
    header: ({ column }) => <Sortable column={column} label="Taux" className="justify-end" />,
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      return (
        <span className="tabular-nums text-muted-foreground">
          {v != null ? `${v.toLocaleString('fr-FR')} %` : '—'}
        </span>
      )
    },
    meta: { align: 'right' },
  },
  {
    accessorKey: 'revenueEur',
    header: ({ column }) => <Sortable column={column} label="Revenus" className="justify-end" />,
    cell: ({ getValue }) => (
      <span className="font-medium tabular-nums">{eur(getValue() as number)}</span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'ltv',
    header: ({ column }) => <Sortable column={column} label="€/sub" className="justify-end" />,
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      return (
        <span className="tabular-nums text-muted-foreground">
          {v != null ? `${v.toLocaleString('fr-FR')} €` : '—'}
        </span>
      )
    },
    meta: { align: 'right' },
  },
  {
    accessorKey: 'active',
    header: 'Statut',
    cell: ({ getValue }) => (
      <Badge className={(getValue() as boolean) ? STATUS_COLORS.positive : STATUS_COLORS.neutral}>
        {(getValue() as boolean) ? 'Actif' : 'Disparu'}
      </Badge>
    ),
    meta: { align: 'center' },
  },
]

type TypeTab = 'all' | 'twitter' | 'instagram' | 'telegram' | 'other'
const TABS: { key: TypeTab; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'twitter', label: 'Twitter' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'other', label: 'Autres' },
]

export function LiensView({ data }: { data: MktLinksData }) {
  const [tab, setTab] = useState<TypeTab>('all')

  const links = useMemo(
    () => (tab === 'all' ? data.links : data.links.filter((l) => l.type === tab)),
    [data.links, tab],
  )
  const totals = useMemo(
    () => ({
      clicks: links.reduce((s, l) => s + l.clicks, 0),
      conversions: links.reduce((s, l) => s + l.conversions, 0),
      revenueEur: Math.round(links.reduce((s, l) => s + l.revenueEur, 0) * 100) / 100,
    }),
    [links],
  )
  const countOf = (t: TypeTab) =>
    t === 'all' ? data.links.length : data.links.filter((l) => l.type === t).length

  const base = { deltaPct: null, trendLabel: '' }
  const kpis = [
    {
      ...base,
      key: 'rev',
      label: 'Revenus',
      value: eur(totals.revenueEur),
      hint: tab === 'all' ? 'tous canaux' : `canal ${TABS.find((t) => t.key === tab)?.label}`,
      info: 'Somme des revenus quotidiens des liens affichés (onglet courant) sur la période — source MyPuls.',
    },
    {
      ...base,
      key: 'conv',
      label: 'Abonnés (conv.)',
      value: num(totals.conversions),
      hint: 'clics devenus abonnés',
      info: 'Somme des conversions des liens affichés — la colonne « Abonnés (Conv.) » de MyPuls.',
    },
    {
      ...base,
      key: 'clicks',
      label: 'Clics',
      value: num(totals.clicks),
      hint: 'sur la période',
      info: 'Somme des clics quotidiens des liens affichés (source MyPuls).',
    },
    {
      ...base,
      key: 'taux',
      label: 'Taux de conversion',
      value: totals.clicks > 0 ? `${(Math.round((totals.conversions / totals.clicks) * 1000) / 10).toLocaleString('fr-FR')} %` : '—',
      hint: 'abonnés ÷ clics',
      info: 'Conversions ÷ clics des liens affichés — calculé chez nous.',
    },
  ]

  return (
    <>
      <KpiGrid kpis={kpis} />

      {/* Onglets par type de lien (mêmes familles que la page legacy). */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TypeTab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1.5 tabular-nums opacity-60">{countOf(t.key)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        key={tab}
        data={links}
        columns={columns}
        filterColumnId="name"
        filterPlaceholder="Filtrer par nom…"
        initialSorting={[{ id: 'revenueEur', desc: true }]}
        pageSize={25}
        getRowId={(l) => l.id}
        countLabel={(n) => `${n} lien(s)`}
      />
    </>
  )
}
