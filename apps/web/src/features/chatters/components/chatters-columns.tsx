'use client'

import { type ColumnDef } from '@tanstack/react-table'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { RoleBadge } from '@/components/role-badge'
import { TeamBadge } from '@/components/team-badge'
import { NewBadge } from '@/components/new-badge'
import { HeaderInfo } from '@/components/data-table/header-info'
import { Sortable } from '@/components/data-table/sortable'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, pct } from '@/lib/format'
import type { ChatterRow } from '@/lib/types/chatters'

// Couleurs de statut partagées (recette badge shadcn) : lib/status-color.ts.

// Dépliable dès qu'il y a des lignes modèle (y compris à 0) ou un reliquat non ventilé.
export const canExpand = (c: ChatterRow) => c.models.length > 0 || c.caUnattributed > 0

const baseColumns: ColumnDef<ChatterRow>[] = [
  {
    id: 'name',
    accessorKey: 'name',
    header: ({ column }) => <Sortable column={column} label="Chatter" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            row.getIsExpanded() && 'rotate-90',
            !row.getCanExpand() && 'opacity-0',
          )}
        />
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="truncate font-medium">{row.original.name}</div>
          {/* Avec le NOM et pas dans la colonne « Closing » : « nouvel arrivant » n'est pas une
              désignation de paie, c'est une propriété de la personne. */}
          <NewBadge
            isNew={row.original.isNew}
            arrivedAt={row.original.arrivedAt}
            leftAt={row.original.leftAt}
          />
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
    // Rôle (setter/closer) et équipe (rouge/bleue) : lus depuis le MEMBRE lié, read-only ici —
    // édités sur la fiche Membre. Le shift a quitté cette table en 0100 (principal sur le membre,
    // placements sur le board depuis 0110) et s'édite dans Membres ou sur le board Organisation :
    // plus de badge ni de crayon sur cette page.
    id: 'crm',
    header: 'Closing',
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <RoleBadge role={row.original.closingRole} />
        <TeamBadge team={row.original.closingTeam} />
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
 * Colonnes de la table chatteurs — LECTURE SEULE depuis 0100.
 *
 * Il y avait ici une 12e colonne d'édition (crayon → dialog `updateChatterCrm`) dont le seul
 * champ était le shift. Le shift ayant rejoint le membre (`profiles.shift`, principal ; placements
 * `profile_creators.shifts` depuis 0110), il s'édite dans Membres et sur le board Organisation :
 * la colonne, son dialog, son action et son schéma ont
 * été supprimés, et les sous-lignes (`chatters-sub-rows.tsx`) sont passées à 11 cellules.
 */
export const chattersColumns: ColumnDef<ChatterRow>[] = baseColumns
