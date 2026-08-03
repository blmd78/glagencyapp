'use client'

import { Fragment } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import { deleteOrgRow, moveOrgTeam, saveOrgRow } from '../actions'
import type { OrgChatter, OrgRow, OrganisationData } from '../types'
import { CHIP_GREEN, CHIP_VIOLET, ChipSelect, DIRECT, ShiftCell } from './org-table-cells'

/**
 * Les lignes de DONNÉES du board (une par couple encadrant × modèle). Extrait d'`org-table.tsx`
 * (split > 300 lignes, docs/guidelines-standard-feature.md §1) — rendu inchangé.
 *
 * Reçoit l'état optimiste du parent plutôt que de le porter : `cellIds` et `displayedTotal`
 * lisent les overrides, `commitCell` les écrit. Les remonter ici aurait séparé l'écriture de
 * l'annulation, qui vit dans le même `setOverrides`.
 */
export function OrgTableRows({
  data,
  isAdmin,
  canWrite,
  pending,
  run,
  cellIds,
  commitCell,
  displayedTotal,
  nameById,
  newById,
}: {
  data: OrganisationData
  /** La STRUCTURE (manager, sous-manager, modèle, suppression de ligne) : admin seul. */
  isAdmin: boolean
  /** Composer les CASES de shift : admin ou encadrant porteur de la page. */
  canWrite: boolean
  pending: boolean
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => void
  cellIds: (creatorId: string, shift: CrmShift, server: OrgChatter[]) => string[]
  commitCell: (
    creatorId: string,
    shift: CrmShift,
    next: string[],
    previous: string[],
    modelName: string,
  ) => void
  displayedTotal: (r: OrgRow) => number
  nameById: Map<string, string>
  newById: Map<string, { isNew: boolean; arrivedAt: string | null }>
}) {
  return (
    <>
    {data.sections.map((section) => (
      <Fragment key={section.managerId || 'sans-manager'}>
        {section.rows.map((r, i) => {
          return (
            <tr
              key={`${r.ownerId}:${r.creatorId}`}
              className={cn('border-t align-top', i === 0 && 'border-t-2')}
            >
              {/* MANAGER — écrit sur CHAQUE ligne (comme la feuille d'origine) : un
                  tableau dont les cellules d'en-tête se vident ligne après ligne se lit
                  mal. Le changer déplace cette équipe (ou le modèle si ligne directe). */}
              <td className="px-3 py-2">
                <div className="flex flex-col items-start gap-0.5">
                    <ChipSelect
                      value={section.managerId || null}
                      label={section.managerName}
                      options={data.managerOptions}
                      chipClass={
                        section.managerId ? CHIP_GREEN : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }
                      editable={isAdmin}
                      disabled={pending}
                      placeholder="Rechercher un manager…"
                      title={
                        r.sousManagerId
                          ? 'Changer déplace toute l’équipe de ce sous-manager'
                          : 'Changer passe le modèle sous l’autre manager'
                      }
                      onSelect={(to) =>
                        run(() =>
                          r.sousManagerId
                            ? moveOrgTeam({
                                sousManagerId: r.sousManagerId,
                                fromManagerId: section.managerId || null,
                                toManagerId: to,
                              })
                            : saveOrgRow({
                                ownerId: to,
                                creatorId: r.creatorId,
                                prevOwnerId: r.ownerId,
                                prevCreatorId: r.creatorId,
                              }),
                        )
                      }
                    />
                </div>
              </td>
              <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-0.5">
                    <ChipSelect
                      value={r.sousManagerId ?? 'direct'}
                      label={r.sousManagerName ?? 'porté par le manager'}
                      options={
                        section.managerId ? [DIRECT, ...data.sousManagerOptions] : data.sousManagerOptions
                      }
                      chipClass={r.sousManagerName ? CHIP_GREEN : 'bg-muted text-muted-foreground'}
                      editable={isAdmin}
                      disabled={pending}
                      placeholder="Rechercher un sous-manager…"
                      onSelect={(v) =>
                        run(() =>
                          saveOrgRow({
                            ownerId: v === 'direct' ? section.managerId : v,
                            creatorId: r.creatorId,
                            prevOwnerId: r.ownerId,
                            prevCreatorId: r.creatorId,
                            sectionManagerId: v === 'direct' ? null : section.managerId || null,
                          }),
                        )
                      }
                    />
                  </div>
              </td>
              <td className="px-3 py-2">
                <ChipSelect
                  value={r.creatorId}
                  label={r.modelName}
                  options={data.modelOptions}
                  chipClass={CHIP_VIOLET}
                  editable={isAdmin}
                  disabled={pending}
                  placeholder="Rechercher un modèle…"
                  onSelect={(v) =>
                    run(() =>
                      saveOrgRow({
                        ownerId: r.ownerId,
                        creatorId: v,
                        prevOwnerId: r.ownerId,
                        prevCreatorId: r.creatorId,
                        sectionManagerId: section.managerId || null,
                      }),
                    )
                  }
                />
              </td>
              {CRM_SHIFTS.map((shift) => (
                <ShiftCell
                  key={shift}
                  shift={shift}
                  ids={cellIds(r.creatorId, shift, r.byShift[shift])}
                  nameById={nameById}
                  newById={newById}
                  options={data.chatterOptions}
                  canWrite={canWrite}
                  modelName={r.modelName}
                  onChange={(next) =>
                    commitCell(
                      r.creatorId,
                      shift,
                      next,
                      cellIds(r.creatorId, shift, r.byShift[shift]),
                      r.modelName,
                    )
                  }
                />
              ))}
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {displayedTotal(r)}
              </td>
              <td className="px-1 py-2 text-right">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground/40 hover:text-red-600"
                    aria-label={`Supprimer la ligne ${r.modelName}`}
                    title="Supprimer la ligne — l’encadrant perd ce modèle ; les chatteurs gardent le leur"
                    disabled={pending}
                    onClick={() => run(() => deleteOrgRow({ ownerId: r.ownerId, creatorId: r.creatorId }))}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </td>
            </tr>
          )
        })}
      </Fragment>
    ))}
    </>
  )
}
