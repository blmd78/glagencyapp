'use client'

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
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
  /** false = long scroll VIRTUALISÉ : toutes les lignes scrollables, seul le viewport rendu. */
  paginated?: boolean
  /**
   * Hauteur de ligne (px) en mode virtualisé (`paginated={false}`). Doit correspondre à la
   * hauteur RÉELLE d'une ligne (contenu mono-ligne) — sinon le scroll dérive. Les lignes sont
   * forcées à cette hauteur. 44 = `p-2` (16) + contenu mono-ligne (badges/cases ~28).
   */
  estimateRowHeight?: number
}

/**
 * Ligne MÉMOÏSÉE : sans elle, chaque re-render du tableau (frappe dans le filtre, patch
 * optimiste, refresh) reconstruisait TOUTES les lignes matérialisées. Comparaison par
 * identité de la donnée (`row.original`) : seules les lignes dont la donnée a changé
 * re-rendent. (Les instances Row de TanStack changent à chaque données ; leurs méthodes
 * restent valides — elles délèguent par id à l'instance de table, qui est stable.)
 *
 * `rowHeight` est CONSTANT sur la durée de vie du tableau (jamais comparé par le memo, à
 * dessein) : en mode virtualisé il fixe la hauteur pour que l'estimation du virtualizer
 * colle au rendu réel.
 */
function DataTableRowInner<T>({
  row,
  expanded,
  renderSubRows,
  rowHeight,
}: {
  row: Row<T>
  expanded: boolean
  renderSubRows?: (row: Row<T>) => ReactNode
  rowHeight?: number
}) {
  const style: CSSProperties | undefined = rowHeight ? { height: rowHeight } : undefined
  return (
    <>
      <TableRow
        style={style}
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

/**
 * Corps VIRTUALISÉ (mode long scroll, `paginated={false}`) : seules les lignes du viewport
 * (+ overscan) sont montées, recyclées au scroll → DOM CONSTANT quelle que soit la profondeur
 * (l'ancien rendu incrémental empilait les <tr> sans jamais les retirer : sur des milliers de
 * spenders × 18 colonnes interactives, le bas de liste finissait par ramer).
 *
 * Composant SÉPARÉ à dessein : `useVirtualizer` (et le `Date.now()` interne de react-virtual,
 * interdit dans le shell prérendu sous `cacheComponents` sans `<Suspense>` au-dessus) ne
 * s'exécute donc QUE pour les tables `paginated={false}` — jamais pour les tables paginées.
 *
 * Table native (pas le wrapper <Table>, qui crée son propre contexte de scroll horizontal et
 * casserait le sticky vertical). Header sticky sur les <th>. Lignes-espaceurs (haut/bas) qui
 * réservent la hauteur des lignes non montées → barre de scroll fidèle. Alignement des colonnes
 * préservé car les lignes restent dans le flux normal (pas de position:absolute).
 */
function VirtualizedTable<T>({
  table,
  estimateRowHeight,
  renderSubRows,
}: {
  table: TanstackTable<T>
  estimateRowHeight: number
  renderSubRows?: (row: Row<T>) => ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 12,
  })
  const items = virtualizer.getVirtualItems()
  const paddingTop = items.length > 0 ? items[0].start : 0
  const paddingBottom = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  // Span exact des colonnes visibles : les lignes-espaceurs portent un <td colSpan> (un <tr>
  // vide ne réserve pas sa hauteur de façon fiable selon les navigateurs).
  const leafColumnCount = table.getVisibleLeafColumns().length

  return (
    <div ref={scrollRef} className="max-h-[70vh] overflow-auto rounded-xl border">
      <table className="w-full caption-bottom text-sm">
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead
                  key={h.id}
                  className={cn(
                    'sticky top-0 z-10 bg-muted',
                    alignClass(h.column.columnDef.meta?.align),
                    h.column.columnDef.meta?.className,
                  )}
                >
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={leafColumnCount} style={{ height: paddingTop, padding: 0 }} />
            </tr>
          )}
          {items.map((vi) => {
            const row = rows[vi.index]
            return (
              <DataTableRow
                key={row.id}
                row={row}
                expanded={row.getIsExpanded()}
                renderSubRows={renderSubRows}
                rowHeight={estimateRowHeight}
              />
            )
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={leafColumnCount} style={{ height: paddingBottom, padding: 0 }} />
            </tr>
          )}
        </TableBody>
      </table>
    </div>
  )
}

/** Data-table shadcn/TanStack réutilisable : filtre + tri + pagination (ou long scroll virtualisé) + lignes dépliables. */
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
  estimateRowHeight = 44,
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

  const filterAndToolbar = (filterColumnId || toolbar) && (
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
  )

  // ── Mode long scroll VIRTUALISÉ ────────────────────────────────────────────────────────
  if (!paginated) {
    return (
      <div className="flex flex-col gap-3">
        {filterAndToolbar}
        <VirtualizedTable
          table={table}
          estimateRowHeight={estimateRowHeight}
          renderSubRows={renderSubRows}
        />
        <div className="text-sm text-muted-foreground">
          {countLabel ? countLabel(count) : count}
        </div>
      </div>
    )
  }

  // ── Mode paginé (défaut) ────────────────────────────────────────────────────────────────
  const rows = table.getRowModel().rows
  return (
    <div className="flex flex-col gap-3">
      {filterAndToolbar}

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
