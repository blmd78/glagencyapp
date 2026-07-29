'use client'

import { Fragment, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { cn } from '@/lib/utils'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import { saveOrgCell } from '../actions'
import type { OrgChatter, OrganisationData } from '../types'

// MÊME DA QUE LE PLANNING REPOS (demande Benoit) : chips vertes pour les personnes, violettes
// pour les modèles, cases pointillées « + Ajouter », en-têtes bg-muted. Classes identiques à
// planning-grid-utils (recopiées : les features ne s'importent pas entre elles).
const CHIP_GREEN = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
const CHIP_VIOLET = 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'

const SHIFT_LABELS: Record<CrmShift, string> = { matin: 'Matin', aprem: 'Après-midi', soir: 'Soir' }

/**
 * Le board d'orga — manager → sous-manager → modèle → chatters par shift, éditable comme le
 * planning repos (ComboboxMultiple, sauvegarde à chaque clic) en WRITE-THROUGH sur les vraies
 * données (cf. actions.ts) : Membres/Chatters se mettent à jour en même temps, et inversement.
 * Overrides optimistes locaux par case, revert sur refus (même patron que planning-grid).
 */
export function OrgTable({ data, isAdmin }: { data: OrganisationData; isAdmin: boolean }) {
  const [, startTransition] = useTransition()
  // Overrides optimistes par case `${creatorId}:${shift}` → ids affichés.
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  const nameById = new Map(data.chatterOptions.map((o) => [o.id, o.name]))

  const cellIds = (creatorId: string, shift: CrmShift, server: OrgChatter[]) =>
    overrides[`${creatorId}:${shift}`] ?? server.map((c) => c.id)

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
            <Fragment key={section.managerName}>
              {section.rows.map((r, i) => (
                <tr
                  key={r.creatorId}
                  className={cn('border-t align-top', si > 0 && i === 0 && 'border-t-2')}
                >
                  <td className="px-3 py-2 font-medium">{i === 0 ? section.managerName : ''}</td>
                  <td className="px-3 py-2">
                    {r.sousManagerName ?? (
                      <span className="text-xs italic text-muted-foreground">direct</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', CHIP_VIOLET)}>
                      {r.modelName}
                    </span>
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
                  <td colSpan={6} className="px-3 py-2 text-sm text-muted-foreground">
                    Aucun modèle assigné à cette équipe — à régler dans Membres.
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
