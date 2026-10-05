'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { eur } from '@/lib/format'
import { roleLabel } from '@/lib/roles'
import type { UnrankedChatter } from '../types'

/** Fiches avec du CA sans membre au rôle `chatteur` — `DataTable` + `Sortable` (guidelines §9). */
export function UnrankedTable({ rows }: { rows: UnrankedChatter[] }) {
  'use no memo'
  const columns: ColumnDef<UnrankedChatter>[] = [
    {
      id: 'name',
      accessorFn: (r) => r.name,
      header: ({ column }) => <Sortable column={column} label="Fiche MyPuls" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'mypulsUserId',
      accessorFn: (r) => r.mypulsUserId ?? '',
      header: 'Id MyPuls',
      cell: ({ row }) => <span className="tabular-nums">{row.original.mypulsUserId ?? '—'}</span>,
    },
    {
      id: 'ca',
      accessorFn: (r) => r.ca,
      header: ({ column }) => <Sortable column={column} label="CA de la période" />,
      meta: { align: 'right' },
      cell: ({ row }) => <span className="tabular-nums">{eur(row.original.ca)}</span>,
    },
    {
      id: 'member',
      accessorFn: (r) => r.memberName ?? '',
      header: 'Membre relié',
      cell: ({ row }) => {
        const { memberName, memberRole } = row.original
        // Nom d'affichage du rôle = `lib/roles.ts` (source unique) ; rien entre parenthèses si vide.
        const role = memberRole ? roleLabel(memberRole) : ''
        return memberName ? (
          <span>
            {memberName} {role && <span className="text-xs text-muted-foreground">({role})</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">aucun</span>
        )
      },
    },
  ]
  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.chatterId}
      filterColumnId="name"
      filterPlaceholder="Filtrer par fiche…"
      initialSorting={[{ id: 'ca', desc: true }]}
      countLabel={(n) => `${n} fiche${n > 1 ? 's' : ''}`}
    />
  )
}
