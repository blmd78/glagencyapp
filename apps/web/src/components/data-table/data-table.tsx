'use client'

import { Fragment, useState, type ReactNode } from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { alignClass } from './sortable'

interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  /** Colonne filtrée par la barre de recherche (masquée si absente). */
  filterColumnId?: string
  filterPlaceholder?: string
  initialSorting?: SortingState
  pageSize?: number
  getRowCanExpand?: (row: Row<T>) => boolean
  /** Lignes de détail rendues sous une ligne dépliée. */
  renderSubRows?: (row: Row<T>) => ReactNode
  /** Libellé du compteur (ex. `n => `${n} chatteur(s)``). */
  countLabel?: (n: number) => string
  /**
   * Identité stable des lignes (ex. `(r) => r.id`). Sans elle, TanStack keye par index :
   * une ligne dépliée pointerait vers une AUTRE entité après changement de données/tri.
   */
  getRowId?: (row: T) => string
}

/** Data-table shadcn/TanStack réutilisable : filtre + tri + pagination + lignes dépliables. */
export function DataTable<T>({
  data,
  columns,
  filterColumnId,
  filterPlaceholder,
  initialSorting = [],
  pageSize = 15,
  getRowCanExpand,
  renderSubRows,
  countLabel,
  getRowId,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getRowCanExpand,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const count = table.getFilteredRowModel().rows.length

  return (
    <div className="flex flex-col gap-3">
      {filterColumnId && (
        <Input
          placeholder={filterPlaceholder}
          value={(table.getColumn(filterColumnId)?.getFilterValue() as string) ?? ''}
          onChange={(e) => table.getColumn(filterColumnId)?.setFilterValue(e.target.value)}
          className="max-w-xs"
        />
      )}

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
                {row.getIsExpanded() && renderSubRows?.(row)}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {countLabel ? countLabel(count) : count}
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
