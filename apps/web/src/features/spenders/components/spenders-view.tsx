'use client'

import { useMemo, useOptimistic, useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { KpiCard, type Kpi } from '@/components/kpi-card'
import { eur } from '@/lib/format'
import { SpendersTable } from './spenders-table'
import { ArchiveButton } from './spender-actions'
import { applyPatch, SpendersOptimisticCtx } from './spenders-optimistic-context'
import { isARelancer, R_ALERTE, type SpenderRow } from '../types'

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
  threshold,
  freshness,
}: {
  spenders: SpenderRow[]
  view: SpendersViewKind
  isAdmin?: boolean
  /** admin ou manager/sous-manager : peut archiver/réactiver/reset. Le chatteur non. */
  canWrite?: boolean
  /** Seuil de tracking (CA net) — affiché dans la carte « Spenders trackés » (liste). */
  threshold?: number
  /** Fraîcheur du scrape déjà formatée (SSR, TZ Paris) — hint des KPIs (liste). */
  freshness?: string | null
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

  // Filtre modèle : l'état vit ICI (pas dans la table) pour que les cartes KPI de la
  // Liste suivent la sélection. MULTIPLE (un chatteur/manager suit souvent plusieurs
  // modèles) — vide = tous les modèles.
  const [models, setModels] = useState<string[]>([])

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

  // Cartes KPI (Liste uniquement) — recalculées sur les modèles sélectionnés, et sur
  // l'état optimiste (archiver un spender décrémente les cartes à l'instant).
  const kpis = useMemo(() => {
    if (view !== 'liste') return null
    const wanted = new Set(models)
    const scope = wanted.size === 0 ? optimistic : optimistic.filter((s) => wanted.has(s.creatorId))
    const actifs = scope.filter((s) => !s.archived)
    const caTotal = actifs.reduce((s, x) => s + x.ca, 0)
    const aRelancer = actifs.filter(isARelancer).length
    const alertesR10 = actifs.filter((s) => s.compteurR >= R_ALERTE).length
    const orphelins = actifs.filter((s) => !s.chatterName && !s.assignedLabel).length

    const cards: Array<Kpi & { accent?: string }> = [
      {
        key: 'spenders',
        label: 'Spenders trackés',
        value: String(actifs.length),
        deltaPct: null,
        trendLabel: `CA ≥ ${threshold} € net MyPuls`,
        hint: freshness ? `scrapé le ${freshness}` : '',
      },
      {
        key: 'ca',
        label: 'CA cumulé spenders',
        value: eur(caTotal),
        deltaPct: null,
        trendLabel: 'total vie de chaque fan',
        hint: 'somme des CA affichés',
        info: 'Somme des CA vie de tous les spenders actifs (chacun = tout son historique MyPuls). Repère de volume, pas un CA de période.',
      },
      {
        key: 'relancer',
        label: 'À relancer',
        value: String(aRelancer),
        deltaPct: null,
        trendLabel: 'non relancés aujourd’hui',
        hint: `cycle en cours (R < ${R_ALERTE})`,
        accent: 'border-t-amber-500',
      },
      {
        key: 'alertes',
        label: `Alertes R${R_ALERTE}`,
        value: String(alertesR10),
        deltaPct: null,
        trendLabel: 'fin de cycle — à archiver',
        hint: `${orphelins} non assigné(s)`,
        accent: 'border-t-red-500',
      },
    ]
    return cards
  }, [view, models, optimistic, threshold, freshness])

  return (
    <SpendersOptimisticCtx.Provider value={ctx}>
      <div className="flex flex-col gap-6">
        {kpis && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map(({ accent, ...k }) => (
              <KpiCard key={k.key} kpi={k} accent={accent} />
            ))}
          </div>
        )}
        <SpendersTable
          spenders={rows}
          extra={extra}
          isAdmin={isAdmin}
          canWrite={canWrite}
          tracker={view === 'tracker'}
          readOnlyRelances={view === 'liste'}
          models={models}
          onModelsChange={setModels}
        />
      </div>
    </SpendersOptimisticCtx.Provider>
  )
}
