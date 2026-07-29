'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Plus, X } from 'lucide-react'
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

// ── LECTURE D'ABORD (refonte 2026-07-29 — la version « une pastille par nom » était
// illisible à côté de la feuille d'origine) ──────────────────────────────────────────────────
// Ce qui rendait la feuille lisible : chaque colonne de shift porte sa teinte — on scanne une
// journée d'un coup d'œil. On garde ce principe, dans le langage de l'app :
//  • pastilles BLEUES des chatters dans les cases (code couleur des rôles) ;
//  • lavis de colonne « heure de la journée » (matin chaud → soir froid) : c'est un FOND, pas
//    un badge — le code couleur des RÔLES (chatter bleu, encadrement vert, police orange,
//    modèle violet) reste réservé aux pastilles ;
//  • la hiérarchie passe par la STRUCTURE, plus par la répétition : une bande par manager, le
//    sous-manager écrit une seule fois sur ses modèles.
const SHIFTS: Record<CrmShift, { label: string; wash: string }> = {
  matin: { label: 'Matin', wash: 'bg-amber-50/70 dark:bg-amber-950/20' },
  aprem: { label: 'Après-midi', wash: 'bg-muted/40' },
  soir: { label: 'Soir', wash: 'bg-indigo-50/70 dark:bg-indigo-950/25' },
}

const CHIP_GREEN = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
const CHIP_VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
const CHIP_BLUE = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'

/**
 * Pastille cliquable (admin) qui ouvre une recherche à choix unique. Au repos : AUCUN cadre,
 * c'est une étiquette. Le fond et le crayon n'apparaissent qu'au survol — l'écran se lit
 * comme un tableau, pas comme un formulaire.
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
    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', chipClass)}>{label}</span>
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
            'group/chip -mx-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors',
            'hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          )}
        >
          {chip}
          <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/chip:opacity-60" />
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

/** Le board d'orga — lecture d'abord, édition au survol. Write-through (cf. actions.ts). */
export function OrgTable({ data, isAdmin }: { data: OrganisationData; isAdmin: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  const [draft, setDraft] = useState<{ manager: string; owner: string } | null>(null)
  const nameById = new Map(data.chatterOptions.map((o) => [o.id, o.name]))

  const cellIds = (creatorId: string, shift: CrmShift, server: OrgChatter[]) =>
    overrides[`${creatorId}:${shift}`] ?? server.map((c) => c.id)

  // Gestes de STRUCTURE (ajout/déplacement de ligne) : la ligne apparaît ou change de
  // section — `revalidatePath` seul ne repeignait pas l'écran, on force le rafraîchissement.
  const run = (fn: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      const res = await fn()
      if (!res.success) {
        toast.error(res.error ?? 'Erreur')
        return
      }
      router.refresh()
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

  const COLS = 7
  const DIRECT = { id: 'direct', name: 'porté par le manager' }

  /** Cellule de shift : pastilles BLEUES des chatters sur le lavis de la colonne ; le cadre
   *  pointillé « + Ajouter » ne s'affiche que sur une case vide (comme le planning repos). */
  function ShiftCell({ creatorId, shift, server }: { creatorId: string; shift: CrmShift; server: OrgChatter[] }) {
    const ids = cellIds(creatorId, shift, server)
    const chips = ids.map((id) => (
      <span key={id} className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_BLUE)}>
        {nameById.get(id) ?? '?'}
      </span>
    ))
    if (!isAdmin)
      return (
        <td className={cn('px-3 py-2 align-top', SHIFTS[shift].wash)}>
          {chips.length ? (
            <div className="flex flex-wrap gap-1">{chips}</div>
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
      )
    return (
      <td className={cn('p-1 align-top', SHIFTS[shift].wash)}>
        <ComboboxMultiple
          trigger={
            <button
              type="button"
              title="Cliquer pour composer ce shift"
              className={cn(
                'group/cell flex min-h-9 w-full items-start gap-1 rounded-md border px-2 py-1.5 text-left transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                // Case VIDE = cadre pointillé « + Ajouter » (même affordance que le planning
                // repos) ; case remplie = pas de cadre, la couleur de colonne suffit.
                chips.length
                  ? 'border-transparent hover:bg-foreground/[0.04]'
                  : 'border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-foreground/[0.04]',
              )}
            >
              {chips.length ? (
                <>
                  <span className="flex flex-wrap gap-1">{chips}</span>
                  <Plus className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-60" />
                </>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                  <Plus className="size-3" />
                  Ajouter
                </span>
              )}
            </button>
          }
          options={data.chatterOptions.filter((o) => o.linked).map((o) => ({ value: o.id, label: o.name }))}
          value={ids}
          labelById={Object.fromEntries(nameById)}
          onChange={(next) => commitCell(creatorId, shift, next, ids)}
          chipClassName={CHIP_BLUE}
          placeholder="Rechercher un chatter…"
        />
      </td>
    )
  }

  return (
    // Retour visuel pendant une écriture (même patron que le planning repos) : le tableau
    // s'estompe et ne prend plus les clics tant que le serveur n'a pas répondu.
    <div
      className={cn(
        'overflow-x-auto rounded-xl border transition-opacity',
        pending && 'pointer-events-none opacity-50',
      )}
      aria-busy={pending}
    >
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="w-40 px-3 py-2.5">Manager</th>
            <th className="w-44 px-3 py-2.5">Sous-manager</th>
            <th className="w-40 px-3 py-2.5">Modèle</th>
            {CRM_SHIFTS.map((s) => (
              <th key={s} className={cn('px-3 py-2.5', SHIFTS[s].wash)}>
                {SHIFTS[s].label}
              </th>
            ))}
            <th className="w-16 px-3 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
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
                      <ShiftCell key={shift} creatorId={r.creatorId} shift={shift} server={r.byShift[shift]} />
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.total}</td>
                  </tr>
                )
              })}
              {section.rows.length === 0 && (
                <tr className="border-t">
                  <td colSpan={COLS} className="px-3 py-2 text-sm text-muted-foreground">
                    Aucun modèle assigné à cette équipe.
                  </td>
                </tr>
              )}
            </Fragment>
          ))}

          {isAdmin && draft && (
            // Ligne d'ajout ALIGNÉE sur les colonnes : on choisit dans l'ordre du tableau
            // (manager → sous-manager → modèle), et le choix du modèle valide la ligne.
            <tr className="border-t-2 bg-muted/30 align-top">
              <td className="px-3 py-2">
                <ChipSelect
                  value={draft.manager || null}
                  label={data.managerOptions.find((m) => m.id === draft.manager)?.name ?? null}
                  options={data.managerOptions}
                  chipClass={CHIP_GREEN}
                  editable
                  placeholder="Rechercher un manager…"
                  onSelect={(m) => setDraft({ manager: m, owner: draft.owner })}
                />
              </td>
              <td className="px-3 py-2">
                <ChipSelect
                  value={draft.owner}
                  label={
                    draft.owner === 'direct'
                      ? 'porté par le manager'
                      : (data.sousManagerOptions.find((o) => o.id === draft.owner)?.name ?? null)
                  }
                  options={[DIRECT, ...data.sousManagerOptions]}
                  chipClass={draft.owner === 'direct' ? 'bg-muted text-muted-foreground' : CHIP_GREEN}
                  editable
                  placeholder="Rechercher un sous-manager…"
                  onSelect={(v) => setDraft({ manager: draft.manager, owner: v })}
                />
              </td>
              <td className="px-3 py-2">
                <ChipSelect
                  value={null}
                  label={null}
                  options={data.modelOptions}
                  chipClass={CHIP_VIOLET}
                  editable
                  disabled={!draft.manager || pending}
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
                        sectionManagerId: d.owner === 'direct' ? null : d.manager,
                      }),
                    )
                  }}
                />
              </td>
              <td colSpan={CRM_SHIFTS.length} className="px-3 py-2 text-xs text-muted-foreground">
                {draft.manager ? 'Choisis le modèle pour créer la ligne.' : 'Choisis d’abord le manager.'}
              </td>
              <td className="px-1 py-2 text-right">
                <Button variant="ghost" size="icon" className="size-6" aria-label="Annuler" onClick={() => setDraft(null)}>
                  <X className="size-3.5" />
                </Button>
              </td>
            </tr>
          )}
          {isAdmin && !draft && (
            <tr className="border-t-2">
              <td colSpan={COLS} className="p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  disabled={pending}
                  onClick={() =>
                    setDraft({ manager: data.sections.find((s) => s.managerId)?.managerId ?? '', owner: 'direct' })
                  }
                >
                  <Plus className="size-3.5" />
                  Ajouter une ligne
                </Button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
