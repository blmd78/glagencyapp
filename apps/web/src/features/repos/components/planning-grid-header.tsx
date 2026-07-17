'use client'

import { Pencil } from 'lucide-react'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { cn } from '@/lib/utils'
import { CHIP_VIOLET } from './planning-grid-utils'
import type { EntityOption, ReposColumn } from '../types'

/** Chips violets STATIQUES des modèles d'une colonne (header non-admin). */
function creatorChipsStatic(creatorIds: string[], creatorById: Record<string, string>) {
  return creatorIds.map((id) => (
    <span key={id} className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_VIOLET)}>
      {creatorById[id] ?? '?'}
    </span>
  ))
}

/**
 * En-tête (`thead`) de la grille : ligne de groupe (Équipes chatters par modèle / Encadrement)
 * puis ligne des colonnes (chips violets des modèles, éditables par l'admin via
 * `ComboboxMultiple`). Extrait de `planning-grid.tsx` (split > 300 lignes, docs/guidelines-
 * standard-feature.md §1) — DOM inchangé.
 */
export function PlanningGridHeader({
  columns,
  isAdmin,
  creatorOptions,
  creatorById,
  onCommitColumn,
}: {
  columns: ReposColumn[]
  isAdmin: boolean
  creatorOptions: EntityOption[]
  creatorById: Record<string, string>
  onCommitColumn: (col: string, ids: string[]) => void
}) {
  return (
    <thead>
      <tr className="bg-muted/50">
        <th className="w-24" />
        <th
          colSpan={columns.filter((c) => !c.encadrement).length}
          className="px-2 pt-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Équipes chatters par modèle
        </th>
        <th
          colSpan={columns.filter((c) => c.encadrement).length}
          className="border-l px-2 pt-2 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Encadrement
        </th>
      </tr>
      <tr className="bg-muted/50 align-top">
        <th className="w-24 px-3 pb-2 text-left text-xs font-medium text-muted-foreground">
          Jour
        </th>
        {columns.map((c, i) => {
          const border =
            c.encadrement && columns[i - 1] && !columns[i - 1].encadrement && 'border-l'
          // Colonnes encadrement : libellé de rôle fixe.
          if (c.encadrement) {
            return (
              <th
                key={c.key}
                className={cn(
                  'px-2 pb-2 text-left text-xs font-medium text-muted-foreground',
                  border,
                )}
              >
                {c.label}
              </th>
            )
          }
          // Colonnes modèles : chips violets (affichage inchangé) — clic admin →
          // combobox multiple (chips + croix + saisie dans le popover).
          const chips = c.creatorIds.length ? (
            <span className="flex flex-wrap items-center gap-1">
              {creatorChipsStatic(c.creatorIds, creatorById)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{c.label}</span>
          )
          return (
            <th key={c.key} className={cn('px-2 pb-2 text-left', border)}>
              {isAdmin ? (
                <ComboboxMultiple
                  trigger={
                    <button
                      type="button"
                      title="Modifier les modèles de la colonne"
                      className="group flex w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {chips}
                      <Pencil className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
                    </button>
                  }
                  value={c.creatorIds}
                  options={creatorOptions.map((o) => ({ value: o.id, label: o.name }))}
                  labelById={creatorById}
                  onChange={(ids) => onCommitColumn(c.key, ids)}
                  chipClassName={CHIP_VIOLET}
                  placeholder="Rechercher un modèle…"
                />
              ) : (
                chips
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
