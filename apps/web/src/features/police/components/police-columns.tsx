'use client'

// Modèle d'agrégat + colonnes de l'historique Police (une ligne = un chatteur sur la période).
// Fichier SÉPARÉ de `police-table.tsx` (qui ne garde que le câblage DataTable) et de
// `police-sub-rows.tsx` (le détail déplié) — même découpe que chatters-columns/chatters-table
// (docs/guidelines-standard-feature.md §1, fichiers < 300 lignes).

import { type ColumnDef } from '@tanstack/react-table'
import { frDayShort } from '@glagency/core'
import { TriangleAlert, Gavel } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ExpandChevron } from '@/components/data-table/expand-chevron'
import { Sortable } from '@/components/data-table/sortable'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur2max as eur } from '@/lib/format'
import type { PoliceEntry } from '../types'

/** Une ligne d'agrégat : un chatteur, ses totaux de la période, son détail (déplié). */
export interface ChatterGroup {
  chatterId: string
  chatterName: string
  /** Détail de la période, plus récent d'abord (jour de faute, puis heure de saisie). */
  entries: PoliceEntry[]
  warnings: number
  totalMalus: number
}

/** Clé de tri chronologique d'une entrée : jour de FAUTE d'abord (une sanction antidatée via le
 *  datepicker se classe à SA date), heure de saisie en départage. Lexicographique = chronologique. */
export const entryKey = (e: PoliceEntry) => `${e.occurredOn} ${e.createdAt}`

/** Agrège les entrées (déjà filtrées par la recherche) par chatteur. */
export function groupByChatter(entries: PoliceEntry[]): ChatterGroup[] {
  const byId = new Map<string, ChatterGroup>()
  for (const e of entries) {
    const g = byId.get(e.chatterId) ?? {
      chatterId: e.chatterId,
      chatterName: e.chatterName,
      entries: [],
      warnings: 0,
      totalMalus: 0,
    }
    g.entries.push(e)
    if (e.kind === 'warning') g.warnings += 1
    else g.totalMalus += e.amountEur
    byId.set(e.chatterId, g)
  }
  for (const g of byId.values())
    // `localeCompare` chaîné : renvoie bien 0 sur les égalités (un comparateur sans cas d'égalité
    // rend le tri instable — deux saisies au même instant flottaient d'un rendu à l'autre).
    g.entries.sort(
      (a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt),
    )
  return [...byId.values()]
}

/** Colonnes d'agrégat : chatter (chevron), nb sanctions, nb avert., total malus, dernière.
 *  STATIQUES — les actions (édition/suppression) vivent dans les sous-lignes de détail,
 *  la dernière cellule de détail absorbe l'écart de colonnes (patron models-table). */
export const POLICE_COLUMNS: ColumnDef<ChatterGroup>[] = [
  {
    accessorKey: 'chatterName',
    header: ({ column }) => <Sortable column={column} label="Chatter" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ExpandChevron row={row} />
        <span className="font-medium">{row.original.chatterName}</span>
      </div>
    ),
  },
  {
    id: 'count',
    accessorFn: (g) => g.entries.length,
    header: ({ column }) => <Sortable column={column} label="Sanctions" />,
    cell: ({ row }) => <span className="tabular-nums">{row.original.entries.length}</span>,
  },
  {
    id: 'warnings',
    accessorFn: (g) => g.warnings,
    header: ({ column }) => <Sortable column={column} label="Avert." />,
    cell: ({ row }) =>
      row.original.warnings > 0 ? (
        <Badge className={STATUS_COLORS.warning}>
          <TriangleAlert className="size-3" />
          {row.original.warnings}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'totalMalus',
    accessorFn: (g) => g.totalMalus,
    header: ({ column }) => <Sortable column={column} label="Total malus" />,
    cell: ({ row }) =>
      row.original.totalMalus > 0 ? (
        <Badge className={STATUS_COLORS.danger}>
          <Gavel className="size-3" />
          {eur(row.original.totalMalus)}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'lastAt',
    // Les entrées sont triées plus récent d'abord → entries[0] EST la dernière sanction :
    // la cellule et le tri lisent la même source (pas de champ dénormalisé à resynchroniser).
    accessorFn: (g) => entryKey(g.entries[0]),
    header: ({ column }) => <Sortable column={column} label="Dernière" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {frDayShort(row.original.entries[0].occurredOn)}
      </span>
    ),
  },
]
