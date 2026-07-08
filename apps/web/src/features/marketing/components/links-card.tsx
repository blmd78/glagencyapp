'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, num } from '@/lib/format'
import type { MktLinkRow } from '../types'

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
    header: ({ column }) => <Sortable column={column} label="Abonnés" className="justify-end" />,
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

/**
 * Liens de tracking d'UN canal (onglet « Liens » des pages Instagram / Twitter /
 * Telegram) : vraie table triable/paginée, cohérente avec le reste de l'app. La table
 * complète tous canaux (avec édition du type) reste sur la page Liens.
 */
export function LinksCard({ links, period }: { links: MktLinkRow[]; period: string }) {
  const shown = links.filter((l) => l.active || l.clicks > 0 || l.revenueEur > 0)
  return (
    <DataTable
      data={shown}
      columns={columns}
      filterColumnId="name"
      filterPlaceholder="Filtrer par lien…"
      initialSorting={[{ id: 'revenueEur', desc: true }]}
      pageSize={15}
      getRowId={(l) => l.id}
      countLabel={(n) => `${n} lien(s) · ${period}`}
    />
  )
}
