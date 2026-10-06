'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { frDateNumeric, todayParis } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { eur } from '@/lib/format'
import { ackIdentityIssue } from '../actions-identity'
import type { IdentityFiche, IdentityIssueRow } from '../types'

const KIND_LABEL: Record<IdentityIssueRow['kind'], string> = {
  doublon: 'Même compte, deux fiches',
  membres_multiples: 'Deux membres reliés',
  homonyme: 'Homonymes mélangés',
  conflit_id: 'Id contradictoire',
  fiche_creee: 'Nouvelle fiche',
  resume_mis_de_cote: 'Résumé mis de côté',
  ecart_invariant: 'Écart résumé / ventes',
}

function Fiche({ f, label }: { f: IdentityFiche | null; label?: string | null }) {
  if (!f) return <span className="text-muted-foreground">{label ?? '—'}</span>
  return (
    <div className="flex flex-col">
      <span className="font-medium">{f.name}</span>
      {f.member && <span className="text-xs text-muted-foreground">relié à {f.member}</span>}
    </div>
  )
}

/** Une section d'anomalies — `DataTable` + `Sortable` (guidelines §9). Seule action : « Vu ». */
export function IdentityIssuesTable({
  rows,
  variant,
}: {
  rows: IdentityIssueRow[]
  variant: 'doubles' | 'nouvelles' | 'montants'
}) {
  'use no memo'
  const [pending, start] = useTransition()
  const ack = (r: IdentityIssueRow) =>
    start(async () => {
      const res = await ackIdentityIssue({ id: r.id })
      if (!res.success) return void toast.error(res.error)
      toast.success('Marqué comme vu.')
    })

  const columns: ColumnDef<IdentityIssueRow>[] = [
    {
      id: 'kind',
      accessorFn: (r) => KIND_LABEL[r.kind],
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{KIND_LABEL[row.original.kind]}</Badge>,
    },
    {
      id: 'mypulsUserId',
      accessorFn: (r) => r.mypulsUserId ?? '',
      header: 'Id MyPuls',
      cell: ({ row }) => <span className="tabular-nums">{row.original.mypulsUserId ?? '—'}</span>,
    },
    {
      id: 'fiche',
      accessorFn: (r) => r.fiche?.name ?? r.label ?? '',
      header: ({ column }) => <Sortable column={column} label="Fiche" />,
      cell: ({ row }) => <Fiche f={row.original.fiche} label={row.original.label} />,
    },
  ]
  if (variant === 'doubles') {
    columns.push({
      id: 'autre',
      accessorFn: (r) => r.autre?.name ?? '',
      header: 'Autre fiche',
      cell: ({ row }) => <Fiche f={row.original.autre} />,
    })
  }
  if (variant === 'montants') {
    columns.push(
      {
        id: 'day',
        accessorFn: (r) => r.day ?? '',
        header: ({ column }) => <Sortable column={column} label="Jour" />,
        cell: ({ row }) => (row.original.day ? frDateNumeric(row.original.day) : '—'),
      },
      {
        id: 'amount',
        accessorFn: (r) => r.amount ?? 0,
        header: ({ column }) => <Sortable column={column} label="Montant" />,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.amount === null ? '—' : eur(row.original.amount)}</span>
        ),
      },
    )
  }
  columns.push(
    {
      id: 'detail',
      accessorFn: (r) => r.detail,
      header: 'Détail',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.detail}</span>,
    },
    {
      id: 'lastSeenAt',
      accessorFn: (r) => r.lastSeenAt,
      header: ({ column }) => <Sortable column={column} label="Dernière détection" />,
      // Jour de PARIS (pas `slice(0, 10)` = jour UTC : le run de 23:05 UTC tombe le lendemain à
      // Paris) — guidelines-data-loading §6.
      cell: ({ row }) => frDateNumeric(todayParis(new Date(row.original.lastSeenAt))),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => ack(row.original)} disabled={pending}>
            Vu
          </Button>
        </div>
      ),
    },
  )

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      filterColumnId="fiche"
      filterPlaceholder="Filtrer par fiche…"
      initialSorting={[{ id: 'lastSeenAt', desc: true }]}
      countLabel={(n) => `${n} ligne${n > 1 ? 's' : ''}`}
    />
  )
}
