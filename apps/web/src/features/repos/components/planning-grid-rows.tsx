'use client'

import { Plus } from 'lucide-react'
import { NewBadge } from '@/components/new-badge'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { cn } from '@/lib/utils'
import { CHIP_RED, chipForCol, normName, tokensOf, type CellChip } from './planning-grid-utils'
import { JOURS, type ReposCell, type ReposColumn, type ReposData, type ReposSelf } from '../types'

/**
 * Corps (`tbody`) de la grille : une ligne par jour (cellules `ComboboxMultiple`, chatteurs au
 * repos) + la ligne de total « Nb repos ». Extrait de `planning-grid.tsx` (split > 300 lignes,
 * docs/guidelines-standard-feature.md §1) — DOM inchangé.
 */
export function PlanningGridRows({
  columns,
  data,
  canWrite,
  isAdmin,
  self,
  cellValue,
  cellChips,
  overByCol,
  onCommitCell,
  onRemoveCellChip,
  countFor,
}: {
  columns: ReposColumn[]
  data: ReposData
  /** Cases des colonnes CHATTEURS (modèles) : admin + manager/sous-manager (miroir RLS). */
  canWrite: boolean
  /** Cases des colonnes ENCADREMENT (Managers/Sous-managers/Policiers) : admin uniquement. */
  isAdmin: boolean
  /** L'appelant : sert à ouvrir SA colonne d'encadrement et à y borner ses options. */
  self: ReposSelf
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
            const kind =
              c.key === 'policiers'
                ? 'police'
                : c.key === 'sous-managers'
                  ? 'sousManager'
                  : c.encadrement
                    ? 'manager'
                    : 'chatteur'
            const optionsByKind = {
              police: data.policierOptions,
              manager: data.managerOptions,
              sousManager: data.sousManagerOptions,
              chatteur: data.chatterOptions,
            }
            const placeholderByKind = {
              police: 'Rechercher un policier…',
              manager: 'Rechercher un manager…',
              sousManager: 'Rechercher un sous-manager…',
              chatteur: 'Rechercher un chatter…',
            }
            // Éditabilité PAR COLONNE. Encadrement : l'admin partout, et depuis 0102 chacun dans
            // LA SIENNE — un manager pose son repos chez les Managers, un policier chez les
            // Policiers. Colonnes chatteurs : ouvertes à tout encadrant (`canWrite`).
            const sienne = c.encadrement && c.key === self.encadrementCol
            const editable = c.encadrement ? isAdmin || sienne : canWrite
            // Couleur de base des chips de la colonne (le rouge d'alerte prime toujours).
            const chip = chipForCol(c.key)
            return (
              <td key={c.key} className={cn('p-1 align-top', border)}>
                {editable ? (
                <ComboboxMultiple
                  trigger={
                    <button
                      type="button"
                      title="Cliquer pour choisir les chatters au repos"
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
                                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
                                ch.over ? CHIP_RED : chip,
                              )}
                            >
                              {ch.label}
                              <NewBadge
                                isNew={ch.isNew ?? false}
                                arrivedAt={ch.arrivedAt ?? null}
                                variant="icon"
                              />
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
                  // Chaque colonne encadrement a les options de SON rôle exact (Managers /
                  // Sous-managers / Policiers) ; colonnes modèles : chatteurs. La RÉSOLUTION
                  // des noms déjà posés (labelById) reste sur la map fusionnée data.chatterById.
                  //
                  // AUTO-ASSIGNATION (0102) : dans sa propre colonne, un non-admin ne se voit que
                  // LUI — proposer ses collègues laisserait cocher un nom que le serveur refuse
                  // (`repos_encadrement_soi_meme`), c'est-à-dire promettre un geste impossible.
                  options={(sienne && !isAdmin
                    ? optionsByKind[kind].filter((o) => o.id === self.id)
                    : optionsByKind[kind]
                  ).map((o) => ({ value: o.id, label: o.name }))}
                  labelById={data.chatterById}
                  // Le combobox ne gère que les IDs — les noms texte legacy restent
                  // intacts (chips retirables via leur croix dans le popover, cf. extraChips).
                  onChange={(ids) => onCommitCell(day, c.key, { ids, names: cell.names })}
                  chipClassName={(id) => (over.ids.has(id) ? CHIP_RED : chip)}
                  chipTitle={(id) =>
                    over.ids.has(id)
                      ? `${data.chatterById[id] ?? '?'} : plus de 2 repos cette semaine`
                      : undefined
                  }
                  extraChips={tokensOf(cell.names).map((t) => ({
                    key: `txt:${t}`,
                    label: t,
                    className: over.txt.has(normName(t)) ? CHIP_RED : chip,
                    title: over.txt.has(normName(t))
                      ? `${t} : plus de 2 repos cette semaine`
                      : undefined,
                    onRemove: () => onRemoveCellChip(day, c.key, { token: t }),
                  }))}
                  placeholder={placeholderByKind[kind]}
                />
                ) : (
                  // Lecture seule (chatteur partout ; manager sur les colonnes encadrement) :
                  // chips statiques, sans combobox ni édition.
                  <div className="flex min-h-9 w-full flex-wrap items-center gap-1 px-1.5 py-1">
                    {chips.length ? (
                      chips.map((ch) => (
                        <span
                          key={ch.key}
                          title={ch.over ? `${ch.label} : plus de 2 repos cette semaine` : undefined}
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
                            ch.over ? CHIP_RED : chip,
                          )}
                        >
                          {ch.label}
                          <NewBadge
                            isNew={ch.isNew ?? false}
                            arrivedAt={ch.arrivedAt ?? null}
                            variant="icon"
                          />
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
