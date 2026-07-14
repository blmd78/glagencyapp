'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { SpendersTable } from './spenders-table'
import { ArchiveButton } from './spender-actions'
import { R_ALERTE, type SpenderRow } from '../types'

export type SpendersViewKind = 'liste' | 'tracker' | 'alertes' | 'archive'

// Relancer (cases R1→R10) et Reset vivent dans les colonnes du tracker — ici on
// n'ajoute que l'action de fin de cycle : archiver (alertes) ou réactiver (archive).

const alerteAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex justify-end">
      <ArchiveButton target={row.original} archived={false} />
    </div>
  ),
  meta: { align: 'right' },
}

const archiveAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex justify-end">
      <ArchiveButton target={row.original} archived />
    </div>
  ),
  meta: { align: 'right' },
}

/** Une vue de la sous-catégorie Spenders : filtre les spenders + action de fin de cycle. */
export function SpendersView({
  spenders,
  view,
  isAdmin,
}: {
  spenders: SpenderRow[]
  view: SpendersViewKind
  isAdmin?: boolean
}) {
  const { rows, extra } = useMemo(() => {
    const actifs = spenders.filter((s) => !s.archived)
    const none = [] as ColumnDef<SpenderRow>[]
    switch (view) {
      // Cycle en cours (R < 10) — le masquage « relancés aujourd'hui » vit dans
      // SpendersTable (après le filtre modèle). Un R10 sort naturellement (→ alertes).
      case 'tracker':
        return { rows: actifs.filter((s) => s.compteurR < R_ALERTE), extra: none }
      case 'alertes':
        return { rows: actifs.filter((s) => s.compteurR >= R_ALERTE), extra: [alerteAction] }
      case 'archive':
        return { rows: spenders.filter((s) => s.archived), extra: [archiveAction] }
      default:
        return { rows: actifs, extra: none }
    }
  }, [spenders, view])

  return (
    <SpendersTable
      spenders={rows}
      extra={extra}
      isAdmin={isAdmin}
      tracker={view === 'tracker'}
      readOnlyRelances={view === 'liste'}
    />
  )
}
