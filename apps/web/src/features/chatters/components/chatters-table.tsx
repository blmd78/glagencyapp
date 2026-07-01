'use client'

import { Fragment, useState } from 'react'
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronRight } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { ChatterRow } from '../types'

// Alignement de colonne, porté par la meta (façon shadcn data-table).
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: 'right' | 'center'
  }
}

const eur = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
const pct = (n: number) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

const canExpand = (c: ChatterRow) => c.nbModels > 0 || c.caUnattributed > 0
const alignClass = (a?: 'right' | 'center') =>
  a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : ''

/** Entête triable façon shadcn data-table (flèche ↕). */
function Sortable({
  column,
  label,
  className,
}: {
  column: Column<ChatterRow, unknown>
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className={cn('inline-flex items-center gap-1 hover:text-foreground', className)}
    >
      {label}
      <ArrowUpDown className="size-3.5 opacity-60" />
    </button>
  )
}

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
          {row.original.nbModels > 1 && (
            <div className="text-xs text-muted-foreground">
              {row.original.nbModels} modèles
            </div>
          )}
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'team',
    header: 'Équipe',
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">{(getValue() as string) ?? '—'}</span>
    ),
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
      <Badge variant={(getValue() as boolean) ? 'secondary' : 'outline'}>
        {(getValue() as boolean) ? 'Actif' : 'Fantôme'}
      </Badge>
    ),
    meta: { align: 'center' },
  },
]

export function ChattersTable({ chatters }: { chatters: ChatterRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'ca', desc: true }])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data: chatters,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getRowCanExpand: (row) => canExpand(row.original),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  })

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Filtrer par chatteur…"
        value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
        onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value)}
        className="max-w-xs"
      />

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={alignClass(h.column.columnDef.meta?.align)}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <Fragment key={row.id}>
                <TableRow
                  className={cn(row.getCanExpand() && 'cursor-pointer')}
                  onClick={() => row.getCanExpand() && row.toggleExpanded()}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={alignClass(cell.column.columnDef.meta?.align)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>

                {row.getIsExpanded() &&
                  row.original.models.map((m) => (
                    <TableRow
                      key={`${row.id}:${m.model}`}
                      className="bg-muted/30 hover:bg-muted/30"
                    >
                      <TableCell className="pl-8 text-muted-foreground">{m.model}</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(m.ca)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(m.ppv)}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(m.tips)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.propose} / {m.vendu}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{pct(m.tauxConv)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-center text-muted-foreground">—</TableCell>
                    </TableRow>
                  ))}

                {row.getIsExpanded() && row.original.caUnattributed > 0 && (
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
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} chatteur(s)
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Suivant
          </Button>
        </div>
      </div>
    </div>
  )
}
