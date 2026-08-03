'use client'

// Défs de colonnes de la table d'activité — même découpe que `members-columns.tsx` (les défs
// vivent à part de la composition, guidelines-standard-feature §1).

import { type ColumnDef } from '@tanstack/react-table'
import { frDateTimeParis } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Sortable } from '@/components/data-table/sortable'
import { ROLE_NAME, ROLE_TONE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import type { MemberEvent } from '../types'
import { KIND_LABEL, KIND_TONE } from './event-kind'

/**
 * Colonnes du flux d'activité : QUI (nom + rôle), QUOI (type + description), QUAND, et PAR QUI.
 *
 * Rôle rendu avec `ROLE_NAME`/`ROLE_TONE`, les mêmes que la table des comptes — c'est ce qui fait
 * que les deux onglets se lisent comme une seule page et pas comme deux écrans étrangers.
 */
export const activityColumns: ColumnDef<MemberEvent>[] = [
  {
    id: 'memberName',
    accessorKey: 'memberName',
    header: ({ column }) => <Sortable column={column} label="Membre" />,
    cell: ({ row }) => <span className="font-medium">{row.original.memberName}</span>,
  },
  {
    id: 'memberRole',
    accessorKey: 'memberRole',
    header: 'Rôle',
    cell: ({ row }) => {
      const role = row.original.memberRole
      // Repli sur la teinte « chatteur » pour une valeur hors table (le `'user'` transitoire de
      // 0059, ou une valeur inconnue) — même garde que `members-columns.tsx`.
      return (
        <Badge className={cn('text-xs font-normal', ROLE_TONE[role] ?? ROLE_TONE.chatteur)}>
          {ROLE_NAME[role] ?? ROLE_NAME.chatteur}
        </Badge>
      )
    },
  },
  {
    id: 'kind',
    accessorKey: 'kind',
    header: 'Type',
    cell: ({ row }) => (
      <Badge className={cn('text-xs font-normal', KIND_TONE[row.original.kind])}>
        {KIND_LABEL[row.original.kind]}
      </Badge>
    ),
  },
  {
    id: 'label',
    accessorKey: 'label',
    header: 'Changement',
    cell: ({ row }) => <span className="text-sm">{row.original.label}</span>,
  },
  {
    id: 'at',
    accessorKey: 'at',
    header: ({ column }) => <Sortable column={column} label="Date" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
        {frDateTimeParis(row.original.at)}
      </span>
    ),
  },
  {
    id: 'actorName',
    accessorKey: 'actorName',
    header: 'Par',
    cell: ({ row }) => (
      // « système » et pas « inconnu » : l'écriture vient d'un script ou de SQL direct — une
      // provenance différente, pas une information manquante.
      <span className="text-sm text-muted-foreground">{row.original.actorName ?? 'système'}</span>
    ),
  },
]
