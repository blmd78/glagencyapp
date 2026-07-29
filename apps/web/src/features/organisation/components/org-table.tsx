'use client'

import { Fragment, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ComboboxMultiple } from '@/components/ui/combobox-multiple'
import { cn } from '@/lib/utils'
import { CRM_SHIFTS, type CrmShift } from '@/lib/types/chatters'
import { saveOrgCell } from '../actions'
import type { OrgChatter, OrganisationData } from '../types'

// REPRODUCTION DU FICHIER D'ORIGINE (capture Benoit 2026-07-29) : en-tête NOIR texte blanc,
// manager répété en gras sur chaque ligne, sous-manager en PASTILLE colorée, cases de shift
// teintées — matin #F4CCCC (rose), après-midi #D9EAD3 (vert), soir #C9DAF8 (bleu), texte
// sombre forcé (teintes fixes quel que soit le thème).
const SHIFT_COLS: Record<CrmShift, { label: string; bg: string }> = {
  matin: { label: 'SHIFT MATIN (Chatteurs)', bg: 'bg-[#F4CCCC]' },
  aprem: { label: 'SHIFT APRÈS-MIDI (Chatteurs)', bg: 'bg-[#D9EAD3]' },
  soir: { label: 'SHIFT SOIR (Chatteurs)', bg: 'bg-[#C9DAF8]' },
}

// Couleurs des pastilles sous-managers, relevées sur le fichier ; les nouveaux venus piochent
// dans la même palette (stable par nom).
const SM_KNOWN: Record<string, string> = {
  MARCO: '#b10202',
  CHERIF: '#38761d',
  AKARI: '#7f6000',
  GAEL: '#3d3d3d',
  RYCH: '#1155cc',
}
const SM_PALETTE = ['#a64d79', '#e69138', '#674ea7', '#134f5c', '#990000', '#0b5394']
const norm = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
const smColor = (name: string) => {
  const n = norm(name)
  if (SM_KNOWN[n]) return SM_KNOWN[n]
  let h = 0
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 997
  return SM_PALETTE[h % SM_PALETTE.length]
}

/** Noms d'une case, séparés par « - » comme dans le fichier. */
const joinNames = (names: string[]) => names.join(' - ')

/**
 * Le board d'orga IDENTIQUE au fichier. Cases éditables comme le planning repos
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
      <table className="w-full min-w-[72rem] border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-950 text-left text-xs font-bold uppercase tracking-wide text-white">
            <th className="px-3 py-2.5 text-center">Manager</th>
            <th className="px-3 py-2.5">Manager</th>
            <th className="px-3 py-2.5">Modèle</th>
            {CRM_SHIFTS.map((s) => (
              <th key={s} className="px-3 py-2.5">
                {SHIFT_COLS[s].label}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right">Total chatteurs</th>
          </tr>
        </thead>
        <tbody className="bg-white text-neutral-900">
          {data.sections.map((section) => (
            <Fragment key={section.managerName}>
              {section.rows.map((r, i) => (
                <tr
                  key={r.creatorId}
                  // Bloc d'équipe encadré comme le fichier : trait appuyé au changement de manager.
                  className={cn('align-top', i === 0 ? 'border-t-2 border-neutral-800' : 'border-t border-neutral-200')}
                >
                  <td className="px-3 py-2.5 text-center font-bold uppercase">{section.managerName}</td>
                  <td className="px-3 py-2.5">
                    {r.sousManagerName ? (
                      <span
                        className="inline-block rounded-full px-3 py-0.5 text-xs font-bold uppercase text-white"
                        style={{ backgroundColor: smColor(r.sousManagerName) }}
                      >
                        {r.sousManagerName}
                      </span>
                    ) : (
                      <span className="text-xs italic text-neutral-400">direct</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block rounded border border-neutral-300 px-2 py-0.5 text-xs font-semibold uppercase">
                      {r.modelName}
                    </span>
                    {r.sansShift.length > 0 && (
                      <div
                        className="mt-1 text-xs text-neutral-400"
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
                        <td key={shift} className={cn('px-3 py-2.5 text-neutral-900', SHIFT_COLS[shift].bg)}>
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
                                'flex min-h-10 w-full items-start px-3 py-2.5 text-left text-neutral-900 transition-[filter]',
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
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.total}</td>
                </tr>
              ))}
              {section.rows.length === 0 && (
                <tr className="border-t-2 border-neutral-800">
                  <td className="px-3 py-2.5 text-center font-bold uppercase">{section.managerName}</td>
                  <td colSpan={6} className="px-3 py-2.5 text-sm text-neutral-400">
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
