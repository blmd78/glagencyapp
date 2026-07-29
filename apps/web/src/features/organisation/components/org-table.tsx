'use client'

import { Fragment, useState, useTransition } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import { moveOrgTeam, saveOrgCell, saveOrgRow } from '../actions'
import type { OrgChatter, OrganisationData } from '../types'

// MÊME DA QUE LE PLANNING REPOS (chips + popovers, pas de selects de formulaire).
// Code couleur demandé par Benoit : encadrement (manager/sous-manager) en VERT, modèle en
// VIOLET, chatters en BLEU. Vert/violet identiques à planning-grid-utils (recopiés : les
// features ne s'importent pas entre elles).
const CHIP_GREEN = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
const CHIP_VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
const CHIP_BLUE = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'

const SHIFT_LABELS: Record<CrmShift, string> = { matin: 'Matin', aprem: 'Après-midi', soir: 'Soir' }

/**
 * Sélecteur « chip » façon repos : la valeur est un chip coloré cliquable (admin) qui ouvre
 * un popover de recherche à choix unique. Non éditable → chip statique.
 */
function ChipSelect({
  value,
  label,
  options,
  onSelect,
  chipClass,
  editable,
  disabled,
  placeholder = 'Rechercher…',
  title,
}: {
  value: string | null
  label: string | null
  options: { id: string; name: string }[]
  onSelect: (id: string) => void
  chipClass: string
  editable: boolean
  disabled?: boolean
  placeholder?: string
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const chip = label ? (
    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', chipClass)}>{label}</span>
  ) : (
    <span className="text-xs text-muted-foreground/60">choisir…</span>
  )
  if (!editable) return chip
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={title ?? 'Cliquer pour changer'}
          className={cn(
            'group flex min-h-8 flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-left transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            label
              ? 'border-transparent hover:bg-muted/50'
              : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/40',
          )}
        >
          {chip}
          <Plus className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} autoFocus />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.name}
                  onSelect={() => {
                    setOpen(false)
                    if (o.id !== value) onSelect(o.id)
                  }}
                >
                  <Check className={cn('size-4', value === o.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Le board d'orga, DYNAMIQUE comme le planning repos : cases de shift éditables (chips bleus,
 * ComboboxMultiple) et LIGNES éditables (admin) — manager, sous-manager, modèle en chips
 * cliquables, ajout/retrait de lignes. Tout est WRITE-THROUGH (cf. actions.ts).
 */
export function OrgTable({ data, isAdmin }: { data: OrganisationData; isAdmin: boolean }) {
  const [pending, startTransition] = useTransition()
  // Overrides optimistes par case `${creatorId}:${shift}` → ids affichés (cases seulement).
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
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

  const chatterChips = (ids: string[]) =>
    ids.map((id) => (
      <span key={id} className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_BLUE)}>
        {nameById.get(id) ?? '?'}
      </span>
    ))

  const rowCount = 7
  const DIRECT = { id: 'direct', name: 'direct (manager)' }
  // Brouillon global « Ajouter une ligne » (un seul bouton, en pied de tableau).
  const [draft, setDraft] = useState<{ manager: string; owner: string } | null>(null)

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
                <tr
                  key={`${r.ownerId}:${r.creatorId}`}
                  className={cn('border-t align-top', si > 0 && i === 0 && 'border-t-2')}
                >
                  <td className="p-1 px-2 align-top">
                    <ChipSelect
                      value={section.managerId}
                      label={section.managerName}
                      options={data.managerOptions}
                      chipClass={CHIP_GREEN}
                      editable={isAdmin}
                      disabled={pending}
                      title={
                        r.sousManagerId
                          ? 'Changer déplace toute l’équipe du sous-manager sous l’autre manager'
                          : 'Changer passe le modèle sous l’autre manager'
                      }
                      onSelect={(to) =>
                        run(() =>
                          r.sousManagerId
                            ? moveOrgTeam({
                                sousManagerId: r.sousManagerId,
                                fromManagerId: section.managerId,
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
                  </td>
                  <td className="p-1 px-2 align-top">
                    <ChipSelect
                      value={r.sousManagerId ?? 'direct'}
                      label={r.sousManagerName ?? 'direct'}
                      options={[DIRECT, ...data.sousManagerOptions]}
                      chipClass={r.sousManagerName ? CHIP_GREEN : 'bg-muted text-muted-foreground'}
                      editable={isAdmin}
                      disabled={pending}
                      onSelect={(v) =>
                        run(() =>
                          saveOrgRow({
                            ownerId: v === 'direct' ? section.managerId : v,
                            creatorId: r.creatorId,
                            prevOwnerId: r.ownerId,
                            prevCreatorId: r.creatorId,
                          }),
                        )
                      }
                    />
                  </td>
                  <td className="p-1 px-2 align-top">
                    <ChipSelect
                      value={r.creatorId}
                      label={r.modelName}
                      options={data.modelOptions}
                      chipClass={CHIP_VIOLET}
                      editable={isAdmin}
                      disabled={pending}
                      onSelect={(v) =>
                        run(() =>
                          saveOrgRow({
                            ownerId: r.ownerId,
                            creatorId: v,
                            prevOwnerId: r.ownerId,
                            prevCreatorId: r.creatorId,
                          }),
                        )
                      }
                    />
                    {r.sansShift.length > 0 && (
                      <div
                        className="mt-1 px-1.5 text-xs text-muted-foreground"
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
                            <div className="flex flex-wrap gap-1">{chatterChips(ids)}</div>
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
                                  {chatterChips(ids)}
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
                          chipClassName={CHIP_BLUE}
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
                  <td className="p-1 px-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_GREEN)}>
                      {section.managerName}
                    </span>
                  </td>
                  <td colSpan={rowCount - 1} className="px-3 py-2 text-sm text-muted-foreground">
                    Aucun modèle assigné à cette équipe.
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {isAdmin && (
            <tr className="border-t-2">
              <td colSpan={rowCount} className="p-1">
                {draft ? (
                  <div className="flex flex-wrap items-center gap-2 px-2 py-1">
                    <ChipSelect
                      value={draft.manager || null}
                      label={data.managerOptions.find((m) => m.id === draft.manager)?.name ?? null}
                      options={data.managerOptions}
                      chipClass={CHIP_GREEN}
                      editable
                      placeholder="Rechercher un manager…"
                      onSelect={(m) => setDraft({ manager: m, owner: draft.owner })}
                    />
                    <ChipSelect
                      value={draft.owner}
                      label={
                        draft.owner === 'direct'
                          ? 'direct'
                          : (data.sousManagerOptions.find((o) => o.id === draft.owner)?.name ?? null)
                      }
                      options={[DIRECT, ...data.sousManagerOptions]}
                      chipClass={draft.owner === 'direct' ? 'bg-muted text-muted-foreground' : CHIP_GREEN}
                      editable
                      placeholder="Rechercher un sous-manager…"
                      onSelect={(v) => setDraft({ manager: draft.manager, owner: v })}
                    />
                    <ChipSelect
                      value={null}
                      label={null}
                      options={data.modelOptions}
                      chipClass={CHIP_VIOLET}
                      editable
                      disabled={!draft.manager}
                      placeholder="Rechercher un modèle…"
                      onSelect={(creator) => {
                        const d = draft
                        setDraft(null)
                        run(() =>
                          saveOrgRow({
                            ownerId: d.owner === 'direct' ? d.manager : d.owner,
                            creatorId: creator,
                            prevOwnerId: null,
                            prevCreatorId: null,
                          }),
                        )
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Annuler l’ajout"
                      onClick={() => setDraft(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    disabled={pending}
                    onClick={() => setDraft({ manager: data.sections[0]?.managerId ?? '', owner: 'direct' })}
                  >
                    <Plus className="size-3.5" />
                    Ajouter une ligne
                  </Button>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
