'use client'

import { useMemo, useOptimistic } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { SpendersTable } from './spenders-table'
import { ArchiveButton } from './spender-actions'
import { applyPatch, SpendersOptimisticCtx } from './spenders-optimistic-context'
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

// Hoisté : une identité STABLE entre renders — un `[]` créé dans le useMemo changeait
// l'identité de `extra` à chaque patch optimiste/refresh → recalcul des colonnes en aval.
const NO_EXTRA: ColumnDef<SpenderRow>[] = []

/** Une vue de la sous-catégorie Spenders : filtre les spenders + action de fin de cycle. */
export function SpendersView({
  spenders,
  view,
  isAdmin,
  canWrite,
}: {
  spenders: SpenderRow[]
  view: SpendersViewKind
  isAdmin?: boolean
  /** admin ou manager/sous-manager : peut archiver/réactiver/reset. Le chatteur non. */
  canWrite?: boolean
}) {
  // Optimistic UI : les lignes affichées = état serveur + patchs des actions en cours
  // (cocher une case sort la ligne de la file À L'INSTANT, comme le fera le serveur).
  // Si une action échoue, React revient tout seul à l'état serveur (revert automatique).
  const [optimistic, apply] = useOptimistic(spenders, applyPatch)
  // Chaque page (/liste, /tracker, /alertes, /archive) fait son propre fetch (standard) —
  // une action revalide le SEGMENT layout partagé (actions.ts) : la vue courante reçoit
  // la donnée fraîche dans la réponse du POST, les 3 autres refetchent à leur prochaine
  // navigation. Les erreurs d'action sont des `toast.error` posés au call site (survivent
  // au démontage du bouton cliqué si le patch optimiste sort la ligne de la vue).
  const ctx = useMemo(() => ({ apply }), [apply])

  const { rows, extra } = useMemo(() => {
    const actifs = optimistic.filter((s) => !s.archived)
    switch (view) {
      // Cycle en cours (R < 10) — le masquage « relancés aujourd'hui » vit dans
      // SpendersTable (après le filtre modèle). Un R10 sort naturellement (→ alertes).
      case 'tracker':
        return { rows: actifs.filter((s) => s.compteurR < R_ALERTE), extra: NO_EXTRA }
      // Colonne d'action (archiver / réactiver) réservée admin+manager : cachée au chatteur.
      case 'alertes':
        return { rows: actifs.filter((s) => s.compteurR >= R_ALERTE), extra: canWrite ? [alerteAction] : NO_EXTRA }
      case 'archive':
        return { rows: optimistic.filter((s) => s.archived), extra: canWrite ? [archiveAction] : NO_EXTRA }
      default:
        return { rows: actifs, extra: NO_EXTRA }
    }
  }, [optimistic, view, canWrite])

  return (
    <SpendersOptimisticCtx.Provider value={ctx}>
      <SpendersTable
        spenders={rows}
        extra={extra}
        isAdmin={isAdmin}
        canWrite={canWrite}
        tracker={view === 'tracker'}
        readOnlyRelances={view === 'liste'}
      />
    </SpendersOptimisticCtx.Provider>
  )
}
