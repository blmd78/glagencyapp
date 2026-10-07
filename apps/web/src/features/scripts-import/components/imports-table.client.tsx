'use client'

import { HoverPrefetchLink } from '@/components/hover-prefetch-link'
import type { ColumnDef } from '@tanstack/react-table'
import { frDateTimeParis } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { importStatus } from '../rules'
import type { ImportListItem } from '../services/get-scripts-import'
import { STATUS_BADGE } from './status-badge'

/** Historique des imports — `DataTable` + `Sortable` (guidelines § 9). */
export function ImportsTable({ imports }: { imports: ImportListItem[] }) {
  'use no memo'
  const now = new Date()
  const columns: ColumnDef<ImportListItem>[] = [
    {
      accessorKey: 'createdAt',
      header: ({ column }) => <Sortable column={column} label="Date" />,
      cell: ({ row }) => frDateTimeParis(row.original.createdAt),
    },
    {
      accessorKey: 'notionTitle',
      header: 'Script',
      cell: ({ row }) => (
        <HoverPrefetchLink className="underline-offset-2 hover:underline" href={`/chatter/import-scripts?import=${row.original.id}`}>
          {row.original.notionTitle}
        </HoverPrefetchLink>
      ),
    },
    { accessorKey: 'creatorName', header: ({ column }) => <Sortable column={column} label="Modèle" /> },
    {
      id: 'status',
      accessorFn: (r) => importStatus(r, now),
      header: 'Statut',
      cell: ({ row }) => {
        const s = importStatus(row.original, now)
        return <Badge className={cn('text-xs', STATUS_BADGE[s])}>{s}</Badge>
      },
    },
    {
      id: 'result',
      header: 'Résultat',
      cell: ({ row }) =>
        row.original.mypulsScriptId ? (
          <span>Script {row.original.mypulsScriptId}</span>
        ) : (
          <span className="text-muted-foreground">{row.original.error ?? '—'}</span>
        ),
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historique</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          data={imports}
          columns={columns}
          filterColumnId="notionTitle"
          filterPlaceholder="Filtrer par script…"
          pageSize={10}
          getRowId={(r) => r.id}
          countLabel={(n) => `${n} import(s)`}
        />
      </CardContent>
    </Card>
  )
}
