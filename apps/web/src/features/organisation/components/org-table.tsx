'use client'

import { Fragment, useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import { deleteOrgRow, moveOrgTeam, saveOrgCell, saveOrgRow } from '../actions'
import type { OrgChatter, OrgRow, OrgSection, OrganisationData } from '../types'

// MÊME DA QUE LE PLANNING REPOS : chips vertes pour les personnes, violettes pour les
// modèles, cases pointillées « + Ajouter ». Classes identiques à planning-grid-utils
// (recopiées : les features ne s'importent pas entre elles).
const CHIP_GREEN = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
const CHIP_VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'

const SHIFT_LABELS: Record<CrmShift, string> = { matin: 'Matin', aprem: 'Après-midi', soir: 'Soir' }

/**
 * Le board d'orga, DYNAMIQUE comme le planning repos :
 *  - cases de shift éditables (ComboboxMultiple, sauvegarde à chaque clic) ;
 *  - LIGNES éditables (admin) : changer le modèle, le sous-manager (ou « direct »), le
 *    manager (déplace toute l'équipe du sous-manager), ajouter/supprimer une ligne.
 * Tout est WRITE-THROUGH (cf. actions.ts) : assignations d'encadrement, rattachements et
 * shifts — Membres/Chatters restent la même vérité. Les changements structurels s'appuient
 * sur la revalidation serveur (pas d'optimiste : la ligne bouge de section).
 */
export function OrgTable({ data, isAdmin }: { data: OrganisationData; isAdmin: boolean }) {
  const [pending, startTransition] = useTransition()
  // Overrides optimistes par case `${creatorId}:${shift}` → ids affichés (cases seulement).
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  // Brouillon « Ajouter une ligne » par manager : owner ('direct' | smId) + modèle.
  const [drafts, setDrafts] = useState<Record<string, { owner: string; creator: string }>>({})
  const nameById = new Map(data.chatterOptions.map((o) => [o.id, o.name]))

  const cellIds = (creatorId: string, shift: CrmShift, server: OrgChatter[]) =>
    overrides[`${creatorId}:${shift}`] ?? server.map((c) => c.id)

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.success) toast.error(res.error ?? 'Erreur')
    })

  function commitCell(creatorId: string, shift: CrmShift, next: string[], previous: string[]) {
    const key = `${creatorId}:${shift}`
    setOverrides((p) => ({ ...p, [key]: next }))
    startTransition(async () => {
      const res = await saveOrgCell({ creatorId, shift, chatterIds: next, previousIds: previous })
      if (!res.success) {
        setOverrides((p) => {
          if (p[key] !== next) return p
          const c = { ...p }
          delete c[key]
          return c
        })
        toast.error(res.error)
      }
    })
  }

  const chips = (ids: string[]) =>
    ids.map((id) => (
      <span key={id} className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_GREEN)}>
        {nameById.get(id) ?? '?'}
      </span>
    ))

  const rowCount = 7

  function ManagerCell({ section, row }: { section: OrgSection; row: OrgRow }) {
    if (!isAdmin) return <span className="font-medium">{section.managerName}</span>
    return (
      <Select
        value={section.managerId}
        onValueChange={(to) =>
          run(() =>
            row.sousManagerId
              ? // Déplace TOUTE l'équipe du sous-manager sous l'autre manager.
                moveOrgTeam({ sousManagerId: row.sousManagerId, fromManagerId: section.managerId, toManagerId: to })
              : // Ligne « direct » : le modèle passe au nouveau manager.
                saveOrgRow({ ownerId: to, creatorId: row.creatorId, prevOwnerId: row.ownerId, prevCreatorId: row.creatorId }),
          )
        }
        disabled={pending}
      >
        <SelectTrigger
          className="h-8 w-32 text-sm font-medium"
          title={row.sousManagerId ? 'Changer déplace toute l’équipe du sous-manager sous l’autre manager' : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {data.managerOptions.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function SousManagerCell({ section, row }: { section: OrgSection; row: OrgRow }) {
    if (!isAdmin)
      return row.sousManagerName ? (
        <span>{row.sousManagerName}</span>
      ) : (
        <span className="text-xs italic text-muted-foreground">direct</span>
      )
    return (
      <Select
        value={row.sousManagerId ?? 'direct'}
        onValueChange={(v) =>
          run(() =>
            saveOrgRow({
              ownerId: v === 'direct' ? section.managerId : v,
              creatorId: row.creatorId,
              prevOwnerId: row.ownerId,
              prevCreatorId: row.creatorId,
            }),
          )
        }
        disabled={pending}
      >
        <SelectTrigger className="h-8 w-36 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="direct">direct (manager)</SelectItem>
          {data.sousManagerOptions.map((sm) => (
            <SelectItem key={sm.id} value={sm.id}>
              {sm.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function ModelCell({ row }: { row: OrgRow }) {
    if (!isAdmin)
      return <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_VIOLET)}>{row.modelName}</span>
    return (
      <Select
        value={row.creatorId}
        onValueChange={(v) =>
          run(() =>
            saveOrgRow({ ownerId: row.ownerId, creatorId: v, prevOwnerId: row.ownerId, prevCreatorId: row.creatorId }),
          )
        }
        disabled={pending}
      >
        <SelectTrigger className="h-8 w-32 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {data.modelOptions.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function AddRowDraft({ section }: { section: OrgSection }) {
    const draft = drafts[section.managerId]
    if (!draft)
      return (
        <tr className="border-t">
          <td colSpan={rowCount} className="p-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              disabled={pending}
              onClick={() => setDrafts((d) => ({ ...d, [section.managerId]: { owner: 'direct', creator: '' } }))}
            >
              <Plus className="size-3.5" />
              Ajouter une ligne
            </Button>
          </td>
        </tr>
      )
    return (
      <tr className="border-t bg-muted/30">
        <td className="px-3 py-2 font-medium">{section.managerName}</td>
        <td className="p-1">
          <Select
            value={draft.owner}
            onValueChange={(v) => setDrafts((d) => ({ ...d, [section.managerId]: { ...draft, owner: v } }))}
          >
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">direct (manager)</SelectItem>
              {data.sousManagerOptions.map((sm) => (
                <SelectItem key={sm.id} value={sm.id}>
                  {sm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="p-1" colSpan={rowCount - 3}>
          <Select
            value={draft.creator || undefined}
            onValueChange={(creator) => {
              setDrafts((d) => {
                const c = { ...d }
                delete c[section.managerId]
                return c
              })
              run(() =>
                saveOrgRow({
                  ownerId: draft.owner === 'direct' ? section.managerId : draft.owner,
                  creatorId: creator,
                  prevOwnerId: null,
                  prevCreatorId: null,
                }),
              )
            }}
          >
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue placeholder="Choisir le modèle…" />
            </SelectTrigger>
            <SelectContent>
              {data.modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="p-1 text-right">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Annuler l’ajout"
            onClick={() =>
              setDrafts((d) => {
                const c = { ...d }
                delete c[section.managerId]
                return c
              })
            }
          >
            <X className="size-3.5" />
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[64rem] border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
            <th className="px-3 py-2">Manager</th>
            <th className="px-3 py-2">Sous-manager</th>
            <th className="px-3 py-2">Modèle</th>
            {CRM_SHIFTS.map((s) => (
              <th key={s} className="px-3 py-2">
                {SHIFT_LABELS[s]}
              </th>
            ))}
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.sections.map((section, si) => (
            <Fragment key={section.managerId}>
              {section.rows.map((r, i) => (
                <tr key={`${r.ownerId}:${r.creatorId}`} className={cn('border-t align-top', si > 0 && i === 0 && 'border-t-2')}>
                  <td className="px-3 py-2 font-medium">
                    {i === 0 || isAdmin ? <ManagerCell section={section} row={r} /> : ''}
                  </td>
                  <td className="px-3 py-2">
                    <SousManagerCell section={section} row={r} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <ModelCell row={r} />
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 text-muted-foreground hover:text-red-600"
                          aria-label={`Retirer la ligne ${r.modelName}`}
                          title="Retirer la ligne (l’encadrant perd le modèle — les chatters ne bougent pas)"
                          disabled={pending}
                          onClick={() => run(() => deleteOrgRow({ ownerId: r.ownerId, creatorId: r.creatorId }))}
                        >
                          <X className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    {r.sansShift.length > 0 && (
                      <div
                        className="mt-1 text-xs text-muted-foreground"
                        title="Membres du modèle sans shift (non liés à un chatteur MyPuls ou shift vide) — les ajouter à une case de shift les place ; le lien se règle dans Membres."
                      >
                        à placer : {r.sansShift.map((c) => c.name).join(', ')}
                      </div>
                    )}
                  </td>
                  {CRM_SHIFTS.map((shift) => {
                    const server = r.byShift[shift]
                    const ids = cellIds(r.creatorId, shift, server)
                    const previous = server.map((c) => c.id)
                    if (!isAdmin)
                      return (
                        <td key={shift} className="px-3 py-2">
                          {ids.length ? (
                            <div className="flex flex-wrap gap-1">{chips(ids)}</div>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )
                    return (
                      <td key={shift} className="p-1 align-top">
                        <ComboboxMultiple
                          trigger={
                            <button
                              type="button"
                              title="Cliquer pour choisir les chatters de ce shift"
                              className={cn(
                                'group flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors',
                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                                ids.length
                                  ? 'border-transparent hover:bg-muted/50'
                                  : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/40',
                              )}
                            >
                              {ids.length ? (
                                <>
                                  {chips(ids)}
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
                          options={data.chatterOptions.map((o) => ({ value: o.id, label: o.name }))}
                          value={ids}
                          labelById={Object.fromEntries(nameById)}
                          onChange={(next) => commitCell(r.creatorId, shift, next, previous)}
                          chipClassName={CHIP_GREEN}
                          placeholder="Rechercher un chatter…"
                        />
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>
                </tr>
              ))}
              {section.rows.length === 0 && (
                <tr className={cn('border-t', si > 0 && 'border-t-2')}>
                  <td className="px-3 py-2 font-medium">{section.managerName}</td>
                  <td colSpan={rowCount - 1} className="px-3 py-2 text-sm text-muted-foreground">
                    Aucun modèle assigné à cette équipe.
                  </td>
                </tr>
              )}
              {isAdmin && <AddRowDraft section={section} />}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
