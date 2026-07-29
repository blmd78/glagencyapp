'use client'

import { Fragment, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { modelColor } from '@/lib/model-color'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import { saveOrgCell, saveOrgStatus } from '../actions'
import type { OrgChatter, OrgStatus, OrganisationData } from '../types'

// Libellés des colonnes de shift — mêmes intitulés que la sheet.
const SHIFT_LABELS: Record<CrmShift, string> = { matin: 'Shift matin', aprem: 'Shift après-midi', soir: 'Shift soir' }
const STATUS_LABELS: Record<OrgStatus, string> = { valide: '✅ Validé', star: '⭐', attention: '⚠️' }

/**
 * Le board d'orga IDENTIQUE à la Google Sheet : Manager (cellule fusionnée) | Sous-manager |
 * Modèle | 3 shifts | Total | Statut. Cases éditables comme le planning repos
 * (ComboboxMultiple, sauvegarde à chaque clic) — WRITE-THROUGH sur les vraies données
 * (cf. actions.ts) : Membres/Chatters se mettent à jour en même temps, et inversement.
 * Overrides optimistes locaux par case (même patron que planning-grid), revert sur refus.
 */
export function OrgTable({ data, isAdmin }: { data: OrganisationData; isAdmin: boolean }) {
  const [, startTransition] = useTransition()
  // Overrides optimistes par case `${creatorId}:${shift}` → ids affichés.
  const [overrides, setOverrides] = useState<Record<string, string[]>>({})
  const [statusOverrides, setStatusOverrides] = useState<Record<string, OrgStatus | null>>({})
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

  function commitStatus(creatorId: string, status: OrgStatus | null) {
    setStatusOverrides((p) => ({ ...p, [creatorId]: status }))
    startTransition(async () => {
      const res = await saveOrgStatus({ creatorId, status })
      if (!res.success) toast.error(res.error)
    })
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[72rem] text-sm">
        <thead>
          <tr className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">Manager</th>
            <th className="px-3 py-2">Sous-manager</th>
            <th className="px-3 py-2">Modèle</th>
            {CRM_SHIFTS.map((s) => (
              <th key={s} className="px-3 py-2">
                {SHIFT_LABELS[s]}
              </th>
            ))}
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {data.sections.map((section) => (
            <Fragment key={section.managerName}>
              {section.rows.map((r, i) => (
                <tr key={r.creatorId} className="border-t align-top">
                  {i === 0 && (
                    <td rowSpan={section.rows.length || 1} className="border-r px-3 py-2 align-top">
                      <div className="font-semibold">{section.managerName}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {section.total} chatter{section.total > 1 ? 's' : ''}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">
                    {r.sousManagerName ?? (
                      <span className="text-xs italic text-muted-foreground">direct</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={modelColor(r.modelName)}>{r.modelName}</Badge>
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
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {ids.map((id) => (
                                <span key={id}>{nameById.get(id) ?? '?'}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )
                    return (
                      <td key={shift} className="p-1">
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
                                  {ids.map((id) => (
                                    <span key={id} className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                                      {nameById.get(id) ?? '?'}
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
                          options={data.chatterOptions.map((o) => ({ value: o.id, label: o.name }))}
                          value={ids}
                          labelById={Object.fromEntries(nameById)}
                          onChange={(next) => commitCell(r.creatorId, shift, next, previous)}
                          placeholder="Rechercher un chatter…"
                        />
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <Select
                        value={(statusOverrides[r.creatorId] !== undefined ? statusOverrides[r.creatorId] : r.status) ?? 'none'}
                        onValueChange={(v) => commitStatus(r.creatorId, v === 'none' ? null : (v as OrgStatus))}
                      >
                        <SelectTrigger className="h-8 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {Object.entries(STATUS_LABELS).map(([v, label]) => (
                            <SelectItem key={v} value={v}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">
                        {r.status ? STATUS_LABELS[r.status] : <span className="text-muted-foreground/40">—</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {section.rows.length === 0 && (
                <tr className="border-t">
                  <td className="border-r px-3 py-2 font-semibold">{section.managerName}</td>
                  <td colSpan={7} className="px-3 py-2 text-sm text-muted-foreground">
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
