'use client'

import { useMemo, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { type ColumnDef, type SortingState } from '@tanstack/react-table'
import { makeColumns } from './spenders-columns'
import { Button } from '@/components/ui/button'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { Toggle } from '@/components/ui/toggle'
import { DataTable } from '@/components/data-table/data-table'
import { type SpenderRow } from '../types'


export function SpendersTable({
  spenders,
  extra = [],
  isAdmin = false,
  canWrite = false,
  tracker = false,
  readOnlyRelances = false,
  models,
  onModelsChange,
  manual,
  sorting,
  onSortingChange,
  search,
  onSearchChange,
  totalCount,
  hasMore,
  onLoadMore,
}: {
  spenders: SpenderRow[]
  /** Colonnes ajoutées en fin (ex. actions du tracker). */
  extra?: ColumnDef<SpenderRow>[]
  isAdmin?: boolean
  /** admin ou manager/sous-manager : peut reset/archiver. Le chatteur non (0060). */
  canWrite?: boolean
  /** Vue « À relancer » : cases R1→R10, date de relance, tri par priorité. */
  tracker?: boolean
  /** Vue « Liste » : compteur en consultation seule (ni « + » ni crayon). */
  readOnlyRelances?: boolean
  /**
   * Filtre modèle CONTRÔLÉ par le parent (SpendersView) : l'état vit là-haut pour que
   * les cartes KPI de la Liste se recalculent sur la sélection. MULTIPLE (un chatteur/
   * manager suit souvent plusieurs modèles) — vide = tous les modèles.
   */
  models: string[]
  onModelsChange: (models: string[]) => void
  /** Mode serveur (0104) : tri, recherche et découpage vivent en base — cf. DataTable. */
  manual?: boolean
  sorting?: SortingState
  onSortingChange?: (next: SortingState) => void
  search?: string
  onSearchChange?: (next: string) => void
  totalCount?: number
  hasMore?: boolean
  onLoadMore?: () => void
}) {
  // Tracker : par défaut on n'affiche QUE les non-relancés du jour (cocher = la ligne
  // sort de la file) ; le toggle bascule sur ceux déjà relancés aujourd'hui.
  const [showDone, setShowDone] = useState(false)

  const modelOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const s of spenders) byId.set(s.creatorId, s.model)
    return [...byId.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [spenders])

  // Le filtre « relancés aujourd'hui » s'applique APRÈS le filtre modèle : le compteur
  // du toggle correspond exactement aux lignes qu'il affichera.
  const { filtered, doneToday } = useMemo(() => {
    const wanted = new Set(models)
    const byModel = wanted.size === 0 ? spenders : spenders.filter((s) => wanted.has(s.creatorId))
    if (!tracker) return { filtered: byModel, doneToday: 0 }
    const done = byModel.filter((s) => s.grise).length
    return { filtered: byModel.filter((s) => (showDone ? s.grise : !s.grise)), doneToday: done }
  }, [spenders, models, tracker, showDone])

  // Libellé du déclencheur : état de la sélection en un coup d'œil.
  const modelLabel =
    models.length === 0
      ? 'Tous les modèles'
      : models.length === 1
        ? (modelOptions.find((o) => o.value === models[0])?.label ?? '1 modèle')
        : `${models.length} modèles`

  const columns = useMemo(() => [...makeColumns(isAdmin, canWrite, tracker, readOnlyRelances), ...extra], [extra, isAdmin, canWrite, tracker, readOnlyRelances])

  return (
    <DataTable
      data={filtered}
      columns={columns}
      filterColumnId="username"
      filterPlaceholder="Filtrer par fan…"
      initialSorting={
        tracker
          ? [
              { id: 'compteurR', desc: false },
              { id: 'ca', desc: true },
            ]
          : [{ id: 'ca', desc: true }]
      }
      getRowId={(s) => `${s.creatorId}:${s.fanId}`}
      paginated={false}
      manual={manual}
      sorting={sorting}
      onSortingChange={onSortingChange}
      search={search}
      onSearchChange={onSearchChange}
      totalCount={totalCount}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      countLabel={(n) => `${n} spender(s)`}
      toolbar={
        <>
          <ComboboxMultiple
            trigger={
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className="h-9 w-44 justify-between font-normal"
              >
                <span className="truncate">{modelLabel}</span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            }
            options={modelOptions}
            value={models}
            onChange={onModelsChange}
            placeholder="Rechercher un modèle…"
          />
          {tracker && (
            <Toggle
              variant="outline"
              size="sm"
              pressed={showDone}
              onPressedChange={setShowDone}
              aria-label="Afficher les spenders déjà relancés aujourd'hui"
            >
              Relancés aujourd’hui ({doneToday})
            </Toggle>
          )}
        </>
      }
    />
  )
}
