'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { eur, num } from '@/lib/format'
import { STATUS_COLORS } from '@/lib/status-color'
import type { UncoveAccountStat } from '../types'

/** Tableau des modèles (DataTable : tri + filtre), même patron que la Compta / les Insights. */
export function UncoveStatsTable({
  accounts,
}: {
  accounts: UncoveAccountStat[]
}) {
  const columns: ColumnDef<UncoveAccountStat>[] = [
    {
      accessorKey: 'label',
      header: ({ column }) => <Sortable column={column} label="Modèle" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {row.original.label}
          {row.original.status === 'reconnect' && (
            <Badge className={cn('text-xs', STATUS_COLORS.danger)}>à reconnecter</Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'currentSubs',
      header: ({ column }) => <Sortable column={column} label="Abonnés" />,
      cell: ({ row }) => <span className="tabular-nums">{num(row.original.currentSubs)}</span>,
      meta: { align: 'right' },
    },
    {
      accessorKey: 'newSubs',
      header: ({ column }) => <Sortable column={column} label="Nouveaux" />,
      cell: ({ row }) => <span className="tabular-nums">{num(row.original.newSubs)}</span>,
      meta: { align: 'right' },
    },
    {
      accessorKey: 'canceledSubs',
      header: ({ column }) => <Sortable column={column} label="Désabos" />,
      cell: ({ row }) => <span className="tabular-nums">{num(row.original.canceledSubs)}</span>,
      meta: { align: 'right' },
    },
    {
      accessorKey: 'revenue',
      header: ({ column }) => <Sortable column={column} label="CA" />,
      cell: ({ row }) => <span className="tabular-nums">{eur(row.original.revenue)}</span>,
      meta: { align: 'right' },
    },
  ]

  return (
    <DataTable
      data={accounts}
      columns={columns}
      getRowId={(r) => r.id}
      filterColumnId="label"
      filterPlaceholder="Filtrer par modèle…"
      initialSorting={[{ id: 'currentSubs', desc: true }]}
      countLabel={(n) => `${n} modèle${n > 1 ? 's' : ''}`}
    />
  )
}
