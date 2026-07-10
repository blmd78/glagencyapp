'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { SpendersTable } from './spenders-table'
import { ArchiveButton } from './spender-actions'
import { R_ALERTE, type SpenderRow } from '../types'

export type SpendersViewKind = 'liste' | 'tracker' | 'alertes' | 'archive'

// Relancer (+) et Reset vivent dans la colonne « Relances » (RelanceCounter) — ici on
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
export function SpendersView({ spenders, view }: { spenders: SpenderRow[]; view: SpendersViewKind }) {
  const { rows, extra } = useMemo(() => {
    const actifs = spenders.filter((s) => !s.archived)
    switch (view) {
      // Cycle en cours (R < 10). On N'EXCLUT PAS les grisés : cocher R+1 ne doit pas faire
      // disparaître la ligne (elle reste, bouton désactivé jusqu'à minuit). Un R10 sort
      // naturellement (bascule en alertes).
      case 'tracker':
        return { rows: actifs.filter((s) => s.compteurR < R_ALERTE), extra: [] as ColumnDef<SpenderRow>[] }
      case 'alertes':
        return { rows: actifs.filter((s) => s.compteurR >= R_ALERTE), extra: [alerteAction] }
      case 'archive':
        return { rows: spenders.filter((s) => s.archived), extra: [archiveAction] }
      default:
        return { rows: actifs, extra: [] as ColumnDef<SpenderRow>[] }
    }
  }, [spenders, view])

  return <SpendersTable spenders={rows} extra={extra} />
}
