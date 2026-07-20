'use client'

import { Plus } from 'lucide-react'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { cn } from '@/lib/utils'
import { CHIP_GREEN, CHIP_RED, normName, tokensOf, type CellChip } from './planning-grid-utils'
import { JOURS, type ReposCell, type ReposColumn, type ReposData } from '../types'

/**
 * Corps (`tbody`) de la grille : une ligne par jour (cellules `ComboboxMultiple`, chatteurs au
 * repos) + la ligne de total « Nb repos ». Extrait de `planning-grid.tsx` (split > 300 lignes,
 * docs/guidelines-standard-feature.md §1) — DOM inchangé.
 */
export function PlanningGridRows({
  columns,
  data,
  canWrite,
  cellValue,
  cellChips,
  overByCol,
  onCommitCell,
  onRemoveCellChip,
  countFor,
}: {
  columns: ReposColumn[]
  data: ReposData
  canWrite: boolean
  cellValue: (day: number, col: string) => ReposCell
  cellChips: (day: number, col: string) => CellChip[]
  overByCol: Map<string, { ids: Set<string>; txt: Set<string> }>
  onCommitCell: (day: number, col: string, next: { ids: string[]; names: string }) => void
  onRemoveCellChip: (day: number, col: string, chip: { id?: string; token?: string }) => void
  countFor: (col: string) => number
}) {
  return (
    <tbody>
      {JOURS.map((jour, day) => (
        <tr key={jour} className="border-t">
          <td className="px-3 py-1.5 font-medium">{jour}</td>
          {columns.map((c, i) => {
            const border =
              c.encadrement && columns[i - 1] && !columns[i - 1].encadrement && 'border-l'
            const cell = cellValue(day, c.key)
            const chips = cellChips(day, c.key)
            const over = overByCol.get(c.key) ?? { ids: new Set<string>(), txt: new Set<string>() }
            // Kind de colonne dérivé UNE fois — indexe `options` et `placeholder` ci-dessous.
            const kind = c.key === 'policiers' ? 'police' : c.encadrement ? 'manager' : 'chatteur'
            const optionsByKind = {
              police: data.policierOptions,
              manager: data.managerOptions,
              chatteur: data.chatterOptions,
            }
            const placeholderByKind = {
              police: 'Rechercher un policier…',
              manager: 'Rechercher un manager…',
              chatteur: 'Rechercher un chatteur…',
            }
            return (
              <td key={c.key} className={cn('p-1 align-top', border)}>
                {canWrite ? (
                <ComboboxMultiple
                  trigger={
                    <button
                      type="button"
                      title="Cliquer pour choisir les chatteurs au repos"
                      className={cn(
                        'group flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        chips.length
                          ? 'border-transparent hover:bg-muted/50'
                          : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/40',
                      )}
                    >
                      {chips.length ? (
                        <>
                          {chips.map((ch) => (
                            <span
                              key={ch.key}
                              title={
                                ch.over ? `${ch.label} : plus de 2 repos cette semaine` : undefined
                              }
                              className={cn(
                                'rounded px-1.5 py-0.5 text-xs font-medium',
                                ch.over ? CHIP_RED : CHIP_GREEN,
                              )}
                            >
                              {ch.label}
                            </span>
                          ))}
                          <Plus className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
                        </>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                          <Plus className="size-3" />
                          Ajouter
                        </span>
                      )}
                    </button>
                  }
                  value={cell.chatterIds}
                  // Colonne Policiers : options = profils rôle police ; colonne Managers :
                  // options = profils rôle manager (uniquement, pas de sous-manager) ;
                  // colonnes modèles : chatteurs actifs. La RÉSOLUTION des noms déjà
                  // assignés (labelById) reste, elle, sur la map fusionnée data.chatterById.
                  options={optionsByKind[kind].map((o) => ({ value: o.id, label: o.name }))}
                  labelById={data.chatterById}
                  // Le combobox ne gère que les IDs — les noms texte legacy restent
                  // intacts (chips retirables via leur croix dans le popover, cf. extraChips).
                  onChange={(ids) => onCommitCell(day, c.key, { ids, names: cell.names })}
                  chipClassName={(id) => (over.ids.has(id) ? CHIP_RED : CHIP_GREEN)}
                  chipTitle={(id) =>
                    over.ids.has(id)
                      ? `${data.chatterById[id] ?? '?'} : plus de 2 repos cette semaine`
                      : undefined
                  }
                  extraChips={tokensOf(cell.names).map((t) => ({
                    key: `txt:${t}`,
                    label: t,
                    className: over.txt.has(normName(t)) ? CHIP_RED : CHIP_GREEN,
                    title: over.txt.has(normName(t))
                      ? `${t} : plus de 2 repos cette semaine`
                      : undefined,
                    onRemove: () => onRemoveCellChip(day, c.key, { token: t }),
                  }))}
                  placeholder={placeholderByKind[kind]}
                />
                ) : (
                  // Lecture seule (chatteur) : chips statiques, sans combobox ni édition.
                  <div className="flex min-h-9 w-full flex-wrap items-center gap-1 px-1.5 py-1">
                    {chips.length ? (
                      chips.map((ch) => (
                        <span
                          key={ch.key}
                          title={ch.over ? `${ch.label} : plus de 2 repos cette semaine` : undefined}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-medium',
                            ch.over ? CHIP_RED : CHIP_GREEN,
                          )}
                        >
                          {ch.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </div>
                )}
              </td>
            )
          })}
        </tr>
      ))}
      <tr className="border-t bg-muted/30">
        <td className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Nb repos
        </td>
        {columns.map((c, i) => (
          <td
            key={c.key}
            className={cn(
              'px-2 py-2 font-semibold tabular-nums',
              c.encadrement && columns[i - 1] && !columns[i - 1].encadrement && 'border-l',
            )}
          >
            {countFor(c.key)}
          </td>
        ))}
      </tr>
    </tbody>
  )
}
