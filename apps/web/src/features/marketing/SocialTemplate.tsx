'use client'

import { frDateNumeric } from '@glagency/core'
import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { num } from '@/lib/format'
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
        <div className="ml-auto flex gap-2">
          <AddAccountDialog platform={data.platform} />
          <SocialEntryDialog platform={data.platform} accounts={data.accounts} />
        </div>
      </div>

      {/* La collecte quotidienne (Apify / API X) n'est pas encore branchée : les relevés
          s'arrêtent au dernier jour du flux Discord legacy. */}
      {data.lastDate && data.lastDate < new Date().toISOString().slice(0, 10) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Dernier relevé : {frDateNumeric(data.lastDate)} — la
          collecte quotidienne sera branchée ({data.platform === 'instagram' ? 'Apify' : 'API X'}).
        </p>
      )}

      <DataTable
        data={data.accounts}
        columns={makeColumns(data.platform)}
        filterColumnId="handle"
        filterPlaceholder="Filtrer par compte…"
        initialSorting={[{ id: 'followers', desc: true }]}
        pageSize={60}
        getRowId={(a) => a.id}
        countLabel={(n) => `${n} compte(s)`}
      />

      <LinksCard links={links} period={data.period} />
    </div>
  )
}
