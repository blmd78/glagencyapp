'use client'

import { useEffect, useState, type ReactNode } from 'react'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { alignClass } from './sortable'
import { DataTableRow, VirtualizedTable } from './virtualized-table'

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
  /**
   * MODE SERVEUR. Tri, recherche et découpage vivent en base : la table n'ordonne ni ne filtre
   * plus ce qu'elle reçoit, elle l'affiche. Indispensable dès qu'on ne détient qu'une TRANCHE —
   * trier 100 lignes sur 9 800 donnerait un classement faux, et convaincant.
   * Les autres tables ne passent pas ces props et gardent le comportement client.
   */
  manual?: boolean
  /** Tri CONTRÔLÉ par le parent (mode serveur) — c'est lui qui refait la requête. */
  sorting?: SortingState
  onSortingChange?: (next: SortingState) => void
  /** Valeur de la barre de recherche, remontée au parent au lieu de filtrer sur place. */
  search?: string
  onSearchChange?: (next: string) => void
  /** Appelé quand le scroll approche du bas — charge la tranche suivante. */
  onLoadMore?: () => void
  /** Reste-t-il des lignes à charger ? `false` coupe les appels. */
  hasMore?: boolean
  /** Nombre total de lignes du PÉRIMÈTRE (pas de la tranche) — alimente `countLabel`. */
  totalCount?: number
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
  manual = false,
  sorting: sortingProp,
  onSortingChange,
  search,
  onSearchChange,
  onLoadMore,
  hasMore = false,
  totalCount,
}: DataTableProps<T>) {
  const [sortingLocal, setSortingLocal] = useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  // En mode serveur le tri appartient au parent (il déclenche la requête) ; sinon il vit ici.
  const sorting = manual && sortingProp ? sortingProp : sortingLocal
  const setSorting = (updater: SortingState | ((s: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    if (manual && onSortingChange) onSortingChange(next)
    else setSortingLocal(next)
  }

  // Mode serveur : le total vient de la base. Afficher les lignes déjà chargées ferait croire
  // que la liste est plus courte qu'elle n'est — « 100 spender(s) » sur un périmètre de 9 800.
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    // Le row model reste monté (les en-têtes triables en dépendent) mais n'ordonne ni ne
    // filtre : la base l'a déjà fait, refaire le travail sur une tranche la mélangerait.
    manualSorting: manual,
    manualFiltering: manual,
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
  const shownCount = manual && totalCount !== undefined ? totalCount : count

  const filterAndToolbar = (filterColumnId || toolbar) && (
    <div className="flex flex-wrap items-center gap-2">
      {filterColumnId && (
        <Input
          placeholder={filterPlaceholder}
          value={manual ? (search ?? '') : ((table.getColumn(filterColumnId)?.getFilterValue() as string) ?? '')}
          onChange={(e) =>
            manual
              ? onSearchChange?.(e.target.value)
              : table.getColumn(filterColumnId)?.setFilterValue(e.target.value)
          }
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
          onLoadMore={onLoadMore}
          hasMore={hasMore}
        />
        <div className="text-sm text-muted-foreground">
          {countLabel ? countLabel(shownCount) : shownCount}
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
          {countLabel ? countLabel(shownCount) : shownCount}
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
