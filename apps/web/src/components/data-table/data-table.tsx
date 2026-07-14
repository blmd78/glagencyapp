'use client'

import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
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
  /** Contrôles additionnels rendus à côté de la barre de recherche (ex. un Select). */
  toolbar?: ReactNode
  /** false = long scroll : toutes les lignes rendues, footer sans boutons de page. */
  paginated?: boolean
}

/**
 * Ligne MÉMOÏSÉE : sans elle, chaque re-render du tableau (frappe dans le filtre, patch
 * optimiste, refresh) reconstruisait TOUTES les lignes matérialisées — après un scroll
 * profond en long scroll, plusieurs secondes de gel. Comparaison par identité de la
 * donnée (`row.original`) : seules les lignes dont la donnée a changé re-rendent.
 * (Les instances Row de TanStack changent à chaque données ; leurs méthodes restent
 * valides — elles délèguent par id à l'instance de table, qui est stable.)
 */
function DataTableRowInner<T>({
  row,
  expanded,
  renderSubRows,
}: {
  row: Row<T>
  expanded: boolean
  renderSubRows?: (row: Row<T>) => ReactNode
}) {
  return (
    <>
      <TableRow
        className={cn(row.getCanExpand() && 'cursor-pointer')}
        onClick={() => row.getCanExpand() && row.toggleExpanded()}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            key={cell.id}
            className={cn(
              alignClass(cell.column.columnDef.meta?.align),
              cell.column.columnDef.meta?.className,
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {expanded && renderSubRows?.(row)}
    </>
  )
}
const DataTableRow = memo(
  DataTableRowInner,
  (prev, next) =>
    prev.row.original === next.row.original &&
    prev.row.id === next.row.id &&
    prev.expanded === next.expanded,
) as typeof DataTableRowInner

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
  toolbar,
  paginated = true,
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
    // Long scroll (paginated=false) : pas de row model de pagination → toutes les lignes.
    ...(paginated && { getPaginationRowModel: getPaginationRowModel() }),
    initialState: { pagination: { pageSize } },
    // Sans ça, TOUT changement de référence de `data` (revalidatePath après une action,
    // ex. cocher une relance) téléporte l'utilisateur en page 1. On garde la page…
    autoResetPageIndex: false,
  })

  // …mais TanStack ne re-clampe pas un pageIndex hors bornes quand les données
  // rétrécissent (page vide sinon) : on clampe nous-mêmes.
  const pageCount = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex
  useEffect(() => {
    if (pageIndex > 0 && pageIndex >= pageCount) table.setPageIndex(Math.max(0, pageCount - 1))
  }, [pageCount, pageIndex, table])

  const count = table.getFilteredRowModel().rows.length

  // Long scroll : rendu PROGRESSIF. Rendre les ~1 700 lignes spenders d'un coup (tracker :
  // × 10 cases cliquables ≈ 17 000 composants) figeait la page ~5 s à chaque affichage.
  // On rend un premier bloc, puis la suite se matérialise à l'approche du bas (sentinelle
  // IntersectionObserver, marge 600 px → couture invisible en scroll normal). Le cap ne
  // fait que croître : un patch optimiste / filtre ne re-téléporte jamais en haut.
  // 30 : ~450 composants au premier paint du tracker (30×15) — le SSR + l'hydratation du
  // premier écran restent légers, la suite arrive au scroll.
  const CHUNK = 30
  const [visibleCount, setVisibleCount] = useState(CHUNK)
  const sentinelRef = useRef<HTMLTableRowElement | null>(null)
  const allRows = table.getRowModel().rows
  const rows = paginated ? allRows : allRows.slice(0, visibleCount)
  const hasMore = !paginated && allRows.length > visibleCount
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisibleCount((c) => c + CHUNK)
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, visibleCount])

  return (
    <div className="flex flex-col gap-3">
      {(filterColumnId || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {filterColumnId && (
            <Input
              placeholder={filterPlaceholder}
              value={(table.getColumn(filterColumnId)?.getFilterValue() as string) ?? ''}
              onChange={(e) => table.getColumn(filterColumnId)?.setFilterValue(e.target.value)}
              className="max-w-xs"
            />
          )}
          {toolbar}
        </div>
      )}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/50">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={cn(
                      alignClass(h.column.columnDef.meta?.align),
                      h.column.columnDef.meta?.className,
                    )}
                  >
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <DataTableRow
                key={row.id}
                row={row}
                expanded={row.getIsExpanded()}
                renderSubRows={renderSubRows}
              />
            ))}
            {hasMore && (
              <TableRow ref={sentinelRef}>
                <TableCell
                  colSpan={columns.length}
                  className="h-10 text-center text-xs text-muted-foreground"
                >
                  …
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {countLabel ? countLabel(count) : count}
        </div>
        {paginated && (
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
        )}
      </div>
    </div>
  )
}
