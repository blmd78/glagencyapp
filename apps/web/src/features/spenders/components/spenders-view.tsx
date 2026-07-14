'use client'

import { useEffect, useMemo, useOptimistic, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { prefetchFull, withPeriod } from '@/lib/nav'
import { SpendersTable } from './spenders-table'
import { ArchiveButton } from './spender-actions'
import {
  applyPatch,
  SpendersOptimisticCtx,
  type SpenderPatch,
} from './spenders-optimistic-context'
import { R_ALERTE, type SpenderRow } from '../types'

export type SpendersViewKind = 'liste' | 'tracker' | 'alertes' | 'archive'

const ALL_VIEWS: SpendersViewKind[] = ['liste', 'tracker', 'alertes', 'archive']

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
  // Optimistic UI : les lignes affichées = état serveur + patchs des actions en cours
  // (cocher une case sort la ligne de la file À L'INSTANT, comme le fera le serveur).
  // Si une action échoue, React revient tout seul à l'état serveur (revert automatique).
  const [optimistic, apply] = useOptimistic(spenders, applyPatch)
  // Resync post-action des vues sœurs : toute Server Action purge le CACHE ROUTER ENTIER
  // (Next 16) — sans ça, basculer liste/tracker/alertes juste après avoir coché repartait
  // au serveur (le sweep sidebar met jusqu'à ~50 s à repasser). L'arrivée de données
  // serveur fraîches (identité de `spenders`) = signal de revalidation → on re-précharge
  // les 3 autres vues en décalé (300 ms — pas de rafale).
  const router = useRouter()
  const searchParams = useSearchParams()
  const firstData = useRef(true)
  useEffect(() => {
    if (firstData.current) {
      firstData.current = false // l'arrivée initiale est couverte par le sweep sidebar
      return
    }
    const timers = ALL_VIEWS.filter((v) => v !== view).map((v, i) =>
      setTimeout(
        () => prefetchFull(router, withPeriod(`/chatter/spenders/${v}`, searchParams)),
        300 + i * 300,
      ),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- déclencheur voulu : la
    // donnée serveur uniquement (les patchs optimistes ne changent pas `spenders`).
  }, [spenders])
  // Erreurs d'action AU NIVEAU VUE : le patch sort souvent la ligne de la vue → le bouton
  // cliqué est démonté avant la réponse, un setState local y serait perdu (revue).
  const [actionError, setActionError] = useState<string | null>(null)
  const ctx = useMemo(
    () => ({
      apply: (p: SpenderPatch) => {
        setActionError(null) // nouvelle action = on repart propre
        apply(p)
      },
      fail: setActionError,
    }),
    [apply],
  )
  useEffect(() => {
    if (!actionError) return
    const t = setTimeout(() => setActionError(null), 8000)
    return () => clearTimeout(t)
  }, [actionError])

  const { rows, extra } = useMemo(() => {
    const actifs = optimistic.filter((s) => !s.archived)
    const none = [] as ColumnDef<SpenderRow>[]
    switch (view) {
      // Cycle en cours (R < 10) — le masquage « relancés aujourd'hui » vit dans
      // SpendersTable (après le filtre modèle). Un R10 sort naturellement (→ alertes).
      case 'tracker':
        return { rows: actifs.filter((s) => s.compteurR < R_ALERTE), extra: none }
      case 'alertes':
        return { rows: actifs.filter((s) => s.compteurR >= R_ALERTE), extra: [alerteAction] }
      case 'archive':
        return { rows: optimistic.filter((s) => s.archived), extra: [archiveAction] }
      default:
        return { rows: actifs, extra: none }
    }
  }, [optimistic, view])

  return (
    <SpendersOptimisticCtx.Provider value={ctx}>
      {actionError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}
      <SpendersTable
        spenders={rows}
        extra={extra}
        isAdmin={isAdmin}
        tracker={view === 'tracker'}
        readOnlyRelances={view === 'liste'}
      />
    </SpendersOptimisticCtx.Provider>
  )
}
