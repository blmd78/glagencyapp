'use client'

import { type ColumnDef, type Row } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/data-table/data-table'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { eur, pct } from '@/lib/format'
import type { ChatterRow } from '../types'

const STATUS_ACTIVE =
  'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900'
const STATUS_GHOST =
  'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:border-zinc-700'

const canExpand = (c: ChatterRow) => c.nbModels > 0 || c.caUnattributed > 0

const columns: ColumnDef<ChatterRow>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }) => <Sortable column={column} label="Chatteur" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            row.getIsExpanded() && 'rotate-90',
            !row.getCanExpand() && 'opacity-0',
          )}
        />
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name}</div>
        </div>
      </div>
    ),
  },
  {
    id: 'models',
    header: 'Modèles',
    cell: ({ row }) => {
      // Priorité à l'assignation API (le "modele_id"), sinon modèles où il a fait du CA.
      const names =
        row.original.assignedModels.length > 0
          ? row.original.assignedModels
          : row.original.models.length > 0
            ? row.original.models.map((m) => m.model)
            : row.original.team
              ? [row.original.team]
              : []
      if (names.length === 0)
        return <span className="text-muted-foreground">—</span>
      const shown = names.slice(0, 4)
      const extra = names.length - shown.length
      return (
        <div className="flex flex-wrap gap-1">
          {shown.map((n) => (
            <Badge key={n} variant="outline" className={cn('font-normal', modelColor(n))}>
              {n}
            </Badge>
          ))}
          {extra > 0 && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              +{extra}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'ca',
    header: ({ column }) => <Sortable column={column} label="CA" className="justify-end" />,
    cell: ({ getValue }) => (
      <span className="font-medium tabular-nums">{eur(getValue() as number)}</span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'com',
    header: 'Com.',
    cell: ({ getValue }) => (
      <span className="tabular-nums text-muted-foreground">{eur(getValue() as number)}</span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'ppv',
    header: ({ column }) => <Sortable column={column} label="PPV" className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{eur(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    accessorKey: 'tips',
    header: ({ column }) => <Sortable column={column} label="Tips" className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{eur(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    id: 'pv',
    header: 'Prop./Vendu',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.propose} / {row.original.vendu}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'tauxConv',
    header: ({ column }) => <Sortable column={column} label="Conv." className="justify-end" />,
    cell: ({ getValue }) => <span className="tabular-nums">{pct(getValue() as number)}</span>,
    meta: { align: 'right' },
  },
  {
    id: 'presence',
    header: 'Présence',
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {Math.round(row.original.presenceActiveH)}h / {Math.round(row.original.presenceIdleH)}h
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'reactiviteS',
    header: 'Réact.',
    cell: ({ getValue }) => (
      <span className="tabular-nums text-muted-foreground">
        {getValue() != null ? `${getValue()}s` : '—'}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'active',
    header: 'Statut',
    cell: ({ getValue }) => (
      <Badge
        variant="outline"
        className={cn('font-medium', (getValue() as boolean) ? STATUS_ACTIVE : STATUS_GHOST)}
      >
        {(getValue() as boolean) ? 'Actif' : 'Fantôme'}
      </Badge>
    ),
    meta: { align: 'center' },
  },
]

/** Détail déplié : une ligne par modèle où le chatteur a produit + reliquat non ventilé. */
function chatterSubRows(row: Row<ChatterRow>) {
  return (
    <>
      {row.original.models.map((m) => (
        <TableRow key={`${row.id}:${m.model}`} className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="pl-8">
            <Badge variant="outline" className={cn('font-normal', modelColor(m.model))}>
              {m.model}
            </Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.ca)}</TableCell>
          <TableCell className="text-right text-muted-foreground">—</TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.ppv)}</TableCell>
          <TableCell className="text-right tabular-nums">{eur(m.tips)}</TableCell>
          {/* « Proposé » n'existe pas au grain chatteur × modèle (non ventilé par MyPuls) :
              tiret plutôt qu'un faux 0, et pas de conv (division par zéro). */}
          <TableCell className="text-right tabular-nums">
            {m.propose > 0 ? m.propose : '—'} / {m.vendu}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {m.propose > 0 ? pct(m.tauxConv) : '—'}
          </TableCell>
          <TableCell className="text-right text-muted-foreground">—</TableCell>
          <TableCell className="text-right text-muted-foreground">—</TableCell>
          <TableCell className="text-center text-muted-foreground">—</TableCell>
        </TableRow>
      ))}
      {row.original.caUnattributed > 0 && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell className="pl-8 italic text-amber-600">
            Non ventilé (identité à résoudre)
          </TableCell>
          <TableCell className="text-muted-foreground">—</TableCell>
          <TableCell className="text-right italic tabular-nums text-amber-600">
            {eur(row.original.caUnattributed)}
          </TableCell>
          <TableCell colSpan={8} className="text-muted-foreground">—</TableCell>
        </TableRow>
      )}
    </>
  )
}

export function ChattersTable({ chatters }: { chatters: ChatterRow[] }) {
  return (
    <DataTable
      data={chatters}
      columns={columns}
      filterColumnId="name"
      filterPlaceholder="Filtrer par chatteur…"
      initialSorting={[{ id: 'ca', desc: true }]}
      getRowCanExpand={(row) => canExpand(row.original)}
      renderSubRows={chatterSubRows}
      countLabel={(n) => `${n} chatteur(s)`}
    />
  )
}
