'use client'

import { useMemo, useState } from 'react'
import { BlockDialog } from './block-dialog'
import { MetaDialog } from './meta-dialog'
import { PlanningBlocksList } from './planning-blocks-list'
import { PlanningHeader } from './planning-header'
import { SECTIONS, durationMin, fmtDuration } from '../types'
import type { PlanningBlock, PlanningData, PlanningMember } from '../types'

/**
 * Planning journalier d'un sous-manager — lecture pour le membre (le RLS ne lui sert
 * que le sien), édition réservée à l'admin (sélecteur de membre + dialogs).
 * Les plages de section, pauses et la répartition du temps sont CALCULÉES des blocs.
 * Split > 300 lignes (docs/guidelines-standard-feature.md §1) : `planning-header.tsx`
 * (titre + sélecteur + actions admin) et `planning-blocks-list.tsx` (Bullet + sections/
 * pauses/blocs, édition) — modèle `chatters-columns.tsx`/`chatters-sub-rows.tsx`. DOM
 * inchangé. Les 2 warnings react-hooks/exhaustive-deps ci-dessous (dépendance `blocks`
 * recréée à chaque rendu) sont connus et préexistants — pas corrigés ici.
 */
export function PlanningView({
  data,
  isAdmin,
  canEdit,
  members,
}: {
  data: PlanningData | null
  isAdmin: boolean
  /** Édition : le planning d'un ADMIN est réservé aux superadmins (consultation sinon). */
  canEdit: boolean
  members: PlanningMember[]
}) {
  const [editingBlock, setEditingBlock] = useState<PlanningBlock | 'new' | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)

  const blocks = data?.blocks ?? []
  const bySection = useMemo(
    () =>
      SECTIONS.map((s) => ({ section: s, blocks: blocks.filter((b) => b.section === s) })).filter(
        (g) => g.blocks.length > 0,
      ),
    [blocks],
  )
  const totalMin = blocks.reduce((s, b) => s + durationMin(b.timeStart, b.timeEnd), 0)
  // Répartition par badge (les blocs sans badge comptent dans le total, pas dans la barre).
  const split = useMemo(() => {
    const m = new Map<string, { min: number; color: string }>()
    for (const b of blocks) {
      if (!b.badge) continue
      const cur = m.get(b.badge) ?? { min: 0, color: b.color }
      cur.min += durationMin(b.timeStart, b.timeEnd)
      m.set(b.badge, cur)
    }
    return [...m.entries()].sort((a, b) => b[1].min - a[1].min)
  }, [blocks])

  const hasPriority = !!(data && (data.priorityTitle || data.priorityBody))

  return (
    <div className="flex flex-col gap-6">
      <PlanningHeader
        data={data}
        isAdmin={isAdmin}
        canEdit={canEdit}
        members={members}
        totalMin={totalMin}
        shiftsCount={bySection.length}
        onOpenMeta={() => setMetaOpen(true)}
        onAddBlock={() => setEditingBlock('new')}
      />

      {/* ── Encart priorité n°1 */}
      {hasPriority && data && (
        <div className="rounded-xl border p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Priorité n°1
            </span>
            <div className="space-y-1.5 text-sm">
              <p>
                {data.priorityTitle && <span className="font-semibold">{data.priorityTitle} </span>}
                {data.priorityBody}
              </p>
              {(data.priorityForbidden || data.priorityAllowed) && (
                <p className="text-sm">
                  {data.priorityForbidden && (
                    <>
                      <span className="font-medium text-red-600 dark:text-red-400">Interdits :</span>{' '}
                      <span className="text-muted-foreground">{data.priorityForbidden}</span>
                    </>
                  )}
                  {data.priorityAllowed && (
                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                      {data.priorityAllowed}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <PlanningBlocksList
        data={data}
        bySection={bySection}
        canEdit={canEdit}
        onEdit={(b) => setEditingBlock(b)}
      />

      {/* ── Tâches annexes */}
      {data && data.annexes.length > 0 && (
        <div className="rounded-xl border border-dashed p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Tâches annexes — en continu, à caler entre les sessions
          </p>
          <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {data.annexes.map((a, i) => (
              <p key={i} className="flex gap-2 text-sm">
                <span className="select-none text-muted-foreground">›</span>
                <span>
                  <span className="font-medium">{a.title}</span>
                  {a.detail && <span className="text-muted-foreground"> : {a.detail}</span>}
                </span>
              </p>
            ))}
          </div>
          {data.annexNote && (
            <p className="mt-3 text-xs italic text-muted-foreground">{data.annexNote}</p>
          )}
        </div>
      )}

      {/* ── Répartition du temps (calculée des blocs, par badge) */}
      {split.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Répartition du temps — {fmtDuration(totalMin)} / jour
          </p>
          <div className="flex h-2.5 overflow-hidden rounded-full">
            {split.map(([badge, v]) => (
              <span
                key={badge}
                title={`${badge} · ${fmtDuration(v.min)}`}
                style={{ width: `${(v.min / totalMin) * 100}%`, backgroundColor: v.color }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {split.map(([badge, v]) => (
              <span key={badge} className="flex items-center gap-1.5 text-sm">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: v.color }} />
                <span className="text-muted-foreground">{badge.toLowerCase()}</span>
                <span className="font-medium tabular-nums">{fmtDuration(v.min)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialogs admin */}
      {canEdit && data && (
        <>
          <BlockDialog
            profileId={data.profileId}
            block={editingBlock !== 'new' ? editingBlock : null}
            open={editingBlock !== null}
            onClose={() => setEditingBlock(null)}
          />
          <MetaDialog data={data} open={metaOpen} onClose={() => setMetaOpen(false)} />
        </>
      )}
    </div>
  )
}
