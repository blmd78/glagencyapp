'use client'

import { memo, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { flexRender, type Row, type Table as TanstackTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { alignClass } from './sortable'

/**
 * Le RENDU des lignes : la ligne mémoïsée, et le long scroll virtualisé qui l'utilise. Extrait
 * de `data-table.tsx` (split > 300 lignes, docs/guidelines-standard-feature.md §1) — DOM
 * inchangé. `data-table.tsx` garde l'état (tri, filtres, pagination) et l'assemblage.
 */


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
export const DataTableRow = memo(
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
export function VirtualizedTable<T>({
  table,
  estimateRowHeight,
  renderSubRows,
  onLoadMore,
  hasMore = false,
}: {
  table: TanstackTable<T>
  estimateRowHeight: number
  renderSubRows?: (row: Row<T>) => ReactNode
  /** Mode serveur : charger la tranche suivante quand le bas approche. */
  onLoadMore?: () => void
  hasMore?: boolean
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
  // INFINITE SCROLL — on déclenche sur le dernier index MONTÉ, pas sur la position du scroll :
  // le virtualiseur sait déjà ce qu'il rend, et une lecture de scrollTop se serait désynchronisée
  // des lignes de hauteur estimée. La marge (overscan + une page d'avance) fait charger avant que
  // l'utilisateur touche le fond, donc sans à-coup visible.
  const dernierIndex = items.length > 0 ? items[items.length - 1].index : 0
  useEffect(() => {
    if (!onLoadMore || !hasMore) return
    if (dernierIndex >= rows.length - 20) onLoadMore()
    // `onLoadMore` est stable côté appelant (useCallback) ; le garde-fou anti-rafale vit là-bas,
    // seul endroit qui sache si une requête est déjà en vol.
  }, [dernierIndex, rows.length, hasMore, onLoadMore])
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
