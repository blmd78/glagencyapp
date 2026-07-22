'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { HeaderInfo } from '@/components/data-table/header-info'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, pct } from '@/lib/format'
import { ChatterCrmDialog } from './chatter-crm-dialog'
import type { ChatterRow } from '@/lib/types/chatters'

// Couleurs de statut partagées (recette badge shadcn) : lib/status-color.ts.

// Dépliable dès qu'il y a des lignes modèle (y compris à 0) ou un reliquat non ventilé.
export const canExpand = (c: ChatterRow) => c.models.length > 0 || c.caUnattributed > 0

const baseColumns: ColumnDef<ChatterRow>[] = [
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
      // Raccord avec la période filtrée : uniquement les modèles où il a fait de
      // l'argent sur la plage (pas d'assignation statique — table figée au 01/07).
      const names = row.original.models.map((m) => m.model)
      if (names.length === 0)
        return <span className="text-muted-foreground">—</span>
      const shown = names.slice(0, 4)
      const extra = names.length - shown.length
      return (
        <div className="flex flex-wrap gap-1">
          {shown.map((n) => (
            <Badge key={n} className={modelColor(n)}>
              {n}
            </Badge>
          ))}
          {extra > 0 && (
            <Badge variant="secondary" className="text-muted-foreground">
              +{extra}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    // Rôle (setter/closer) et équipe (rouge/bleue) sont lus depuis le MEMBRE lié (read-only,
    // édités sur la fiche Membre) ; shift reste propre au chatteur, édité via le crayon.
    id: 'crm',
    header: 'Closing',
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        {row.original.closingRole && (
          <Badge variant="secondary">
            {row.original.closingRole === 'closer' ? 'Closer' : 'Setter'}
          </Badge>
        )}
        {row.original.closingTeam && (
          <Badge
            className={
              row.original.closingTeam === 'rouge'
                ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
            }
          >
            {row.original.closingTeam === 'rouge' ? 'Rouge' : 'Bleue'}
          </Badge>
        )}
        {row.original.shift && (
          <Badge variant="outline" className="text-muted-foreground">
            {row.original.shift === 'matin' ? 'Matin' : row.original.shift === 'aprem' ? 'Aprem' : 'Soir'}
          </Badge>
        )}
      </div>
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
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      return <span className="tabular-nums text-muted-foreground">{v === null ? '—' : eur(v)}</span>
    },
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
        {row.original.propose === null
          ? row.original.vendu
          : `${row.original.propose} / ${row.original.vendu}`}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'tauxConv',
    header: ({ column }) => <Sortable column={column} label="Conv." className="justify-end" />,
    cell: ({ getValue }) => {
      const v = getValue() as number | null
      return <span className="tabular-nums">{v === null ? '—' : pct(v)}</span>
    },
    meta: { align: 'right' },
  },
  {
    id: 'presence',
    header: () => (
      <div className="flex items-center justify-end gap-1.5">
        <span>Présence</span>
        <HeaderInfo text="Heures cumulées sur la période : actives / inactives. Actif = en train de chatter ; inactif (idle) = connecté sans activité. Source : page money-team MyPuls." />
      </div>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {row.original.presenceActiveH === null || row.original.presenceIdleH === null
          ? '—'
          : `${Math.round(row.original.presenceActiveH)}h / ${Math.round(row.original.presenceIdleH)}h`}
      </span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'reactiviteS',
    header: () => (
      <div className="flex items-center justify-end gap-1.5">
        <span>Réact.</span>
        <HeaderInfo text="Temps de réponse moyen aux fans, en secondes (moyenne des jours de la période). Plus bas = mieux. Source : page money-team MyPuls." />
      </div>
    ),
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
        className={(getValue() as boolean) ? STATUS_COLORS.positive : STATUS_COLORS.neutral}
      >
        {(getValue() as boolean) ? 'Actif' : 'Fantôme'}
      </Badge>
    ),
    meta: { align: 'center' },
  },
]

/**
 * Colonnes de la table chatteurs. La colonne d'édition CRM (crayon → dialog `updateChatterCrm`)
 * n'apparaît que pour un compte en écriture (`canWrite` = admin ou manager/sous-manager) — un
 * chatteur est en lecture seule (aligné sur la policy `chatters_crm_update` / `hasWriteAccess`).
 * La colonne reste toujours présente (cellule vide pour un chatteur) pour préserver
 * l'alignement des sous-lignes (`chatters-sub-rows.tsx`, 13 cellules).
 */
export function makeChattersColumns({ canWrite }: { canWrite: boolean }): ColumnDef<ChatterRow>[] {
  return [
    ...baseColumns,
    {
      id: 'edit',
      header: '',
      cell: ({ row }) => (
        // stopPropagation : le dialog et ses selects sont portalés dans <body> côté DOM mais
        // enfants de cette cellule côté React — sans ça, tout clic dans la modal bubble
        // jusqu'au onClick d'expansion de la ligne (data-table.tsx).
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {canWrite && <ChatterCrmDialog chatter={row.original} />}
        </div>
      ),
      meta: { align: 'right' },
    },
  ]
}
