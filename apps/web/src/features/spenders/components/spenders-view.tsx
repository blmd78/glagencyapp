'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { SpendersTable } from './spenders-table'
import { RelanceButton, ResetButton, ArchiveButton } from './spender-actions'
import { isARelancer, R_ALERTE, type SpenderRow } from '../types'

export type SpendersViewKind = 'liste' | 'tracker' | 'alertes' | 'archive'

/** Colonne d'action Relancer (+ Reset proposé si le fan a reconverti). */
const relanceAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex items-center justify-end gap-1">
      {row.original.conversionPending && <ResetButton target={row.original} />}
      <RelanceButton spender={row.original} />
    </div>
  ),
  meta: { align: 'right' },
}

/** Colonne d'action des alertes R10 : Reset (si reconverti) + Archiver. */
const alerteAction: ColumnDef<SpenderRow> = {
  id: 'action',
  header: '',
  cell: ({ row }) => (
    <div className="flex items-center justify-end gap-1">
      {row.original.conversionPending && <ResetButton target={row.original} />}
      <ArchiveButton target={row.original} archived={false} />
    </div>
  ),
  meta: { align: 'right' },
}

/** Colonne d'action de l'archive : Réactiver. */
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

/** Une vue de la sous-catégorie Spenders : filtre les spenders + colonne d'action adaptée. */
export function SpendersView({ spenders, view }: { spenders: SpenderRow[]; view: SpendersViewKind }) {
  const { rows, action } = useMemo(() => {
    const actifs = spenders.filter((s) => !s.archived)
    switch (view) {
      case 'tracker':
        return { rows: actifs.filter(isARelancer), action: relanceAction }
      case 'alertes':
        return { rows: actifs.filter((s) => s.compteurR >= R_ALERTE), action: alerteAction }
      case 'archive':
        return { rows: spenders.filter((s) => s.archived), action: archiveAction }
      default:
        return { rows: actifs, action: relanceAction }
    }
  }, [spenders, view])

  return <SpendersTable spenders={rows} extra={[action]} />
}
