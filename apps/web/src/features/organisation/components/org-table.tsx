'use client'

import { Fragment, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { cn } from '@/lib/utils'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import { saveOrgCell } from '../actions'
import type { OrgChatter, OrganisationData } from '../types'

// EN-TÊTES ET COULEURS DU FICHIER D'ORIGINE (reproduction demandée « à l'identique ») :
// matin #F4CCCC (rose), après-midi #D9EAD3 (vert), soir #C9DAF8 (bleu). Le texte est forcé
// sombre dans ces cases — les teintes claires ne changent pas avec le thème.
const SHIFT_COLS: Record<CrmShift, { label: string; bg: string }> = {
  matin: { label: 'SHIFT MATIN', bg: 'bg-[#F4CCCC]' },
  aprem: { label: 'SHIFT APRÈS-MIDI', bg: 'bg-[#D9EAD3]' },
  soir: { label: 'SHIFT SOIR', bg: 'bg-[#C9DAF8]' },
}

/** Noms d'une case, séparés par « - » comme dans le fichier. */
const joinNames = (names: string[]) => names.join(' - ')

/**
 * Le board d'orga IDENTIQUE au fichier : MANAGER (cellule fusionnée) | MANAGER 2 | MODÈLE |
 * 3 shifts colorés | TOTAL CHATTEURS. Cases éditables comme le planning repos
 * (ComboboxMultiple, sauvegarde à chaque clic) — WRITE-THROUGH sur les vraies données
 * (cf. actions.ts) : Membres/Chatters se mettent à jour en même temps, et inversement.
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

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[72rem] text-sm">
        <thead>
          <tr className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">Manager</th>
            <th className="px-3 py-2">Manager 2</th>
            <th className="px-3 py-2">Modèle</th>
            {CRM_SHIFTS.map((s) => (
              <th key={s} className="px-3 py-2">
                {SHIFT_COLS[s].label}
              </th>
            ))}
            <th className="px-3 py-2 text-right">Total chatteurs</th>
          </tr>
        </thead>
        <tbody>
          {data.sections.map((section) => (
            <Fragment key={section.managerName}>
              {section.rows.map((r, i) => (
                <tr key={r.creatorId} className="border-t align-top">
                  {i === 0 && (
                    <td rowSpan={section.rows.length || 1} className="border-r px-3 py-2 align-top">
                      <div className="font-semibold uppercase">{section.managerName}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {section.total} chatter{section.total > 1 ? 's' : ''}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium uppercase">
                    {r.sousManagerName ?? (
                      <span className="text-xs italic normal-case text-muted-foreground">direct</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium uppercase">
                    {r.modelName}
                    {r.sansShift.length > 0 && (
                      <div
                        className="mt-1 text-xs font-normal normal-case text-muted-foreground"
                        title="Membres du modèle sans shift (non liés à un chatteur MyPuls ou shift vide) — les ajouter à une case de shift les place ; le lien se règle dans Membres."
                      >
                        à placer : {joinNames(r.sansShift.map((c) => c.name))}
                      </div>
                    )}
                  </td>
                  {CRM_SHIFTS.map((shift) => {
                    const server = r.byShift[shift]
                    const ids = cellIds(r.creatorId, shift, server)
                    const previous = server.map((c) => c.id)
                    const names = joinNames(ids.map((id) => nameById.get(id) ?? '?'))
                    if (!isAdmin)
                      return (
                        <td key={shift} className={cn('px-3 py-2 text-neutral-900', SHIFT_COLS[shift].bg)}>
                          {names || <span className="text-neutral-900/40">—</span>}
                        </td>
                      )
                    return (
                      <td key={shift} className={cn('p-0 align-top', SHIFT_COLS[shift].bg)}>
                        <ComboboxMultiple
                          trigger={
                            <button
                              type="button"
                              title="Cliquer pour choisir les chatters de ce shift"
                              className={cn(
                                'flex min-h-9 w-full items-start px-3 py-2 text-left text-neutral-900 transition-colors',
                                'hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                              )}
                            >
                              {names || <span className="text-neutral-900/40">Ajouter</span>}
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
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{r.total}</td>
                </tr>
              ))}
              {section.rows.length === 0 && (
                <tr className="border-t">
                  <td className="border-r px-3 py-2 font-semibold uppercase">{section.managerName}</td>
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
