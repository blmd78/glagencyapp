'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { deleteBlock } from '../actions'
import { BlockDialog } from './block-dialog'
import { MetaDialog } from './meta-dialog'
import { SECTIONS, SECTION_LABELS, durationMin, fmtDuration, fmtTime, toMin } from '../sections'
import type { PlanningBlock, PlanningData, PlanningMember } from '../types'

/** « Lead : détail » → lead en gras (convention de saisie des puces). */
function Bullet({ text }: { text: string }) {
  const i = text.indexOf(' : ')
  return (
    <li className="flex gap-2 text-sm">
      <span className="select-none text-muted-foreground">›</span>
      {i === -1 ? (
        <span>{text}</span>
      ) : (
        <span>
          <span className="font-medium">{text.slice(0, i)}</span>
          <span className="text-muted-foreground"> : {text.slice(i + 3)}</span>
        </span>
      )}
    </li>
  )
}

/**
 * Planning journalier d'un sous-manager — lecture pour le membre (le RLS ne lui sert
 * que le sien), édition réservée à l'admin (sélecteur de membre + dialogs).
 * Les plages de section, pauses et la répartition du temps sont CALCULÉES des blocs.
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
  const router = useRouter()
  const [editingBlock, setEditingBlock] = useState<PlanningBlock | 'new' | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)

  const blocks = data?.blocks ?? []
  const bySection = useMemo(
    () => SECTIONS.map((s) => ({ section: s, blocks: blocks.filter((b) => b.section === s) })).filter((g) => g.blocks.length > 0),
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
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning journalier</h1>
          <p className="text-sm text-muted-foreground">
            {data ? data.profileName : 'Aucun membre'}
            {totalMin > 0 && (
              <>
                {' '}· {fmtDuration(totalMin)} de travail effectif · {bySection.length} shift
                {bySection.length > 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
        {isAdmin && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Combobox
              value={data?.profileId ?? ''}
              onChange={(id) => router.push(`/chatter/planning?membre=${id}`)}
              className="w-52"
              placeholder="Choisir un membre…"
              searchPlaceholder="Rechercher un membre…"
              options={members.map((m) => ({
                value: m.id,
                label: m.role === 'manager' ? `${m.name} · manager` : m.name,
              }))}
            />
            {data && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMetaOpen(true)}>
                  <SlidersHorizontal className="size-3.5" />
                  Priorité & annexes
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => setEditingBlock('new')}>
                  <CalendarPlus className="size-3.5" />
                  Ajouter un bloc
                </Button>
              </>
            )}
          </div>
        )}
      </div>

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

      {/* ── Sections + pauses (déduites du trou entre deux sections) */}
      {data && blocks.length > 0 ? (
        <div className="flex flex-col gap-6">
          {bySection.map((group, gi) => {
            const first = group.blocks[0]
            const last = group.blocks[group.blocks.length - 1]
            const sectionMin = group.blocks.reduce((s, b) => s + durationMin(b.timeStart, b.timeEnd), 0)
            const prev = gi > 0 ? bySection[gi - 1] : null
            const prevEnd = prev ? prev.blocks[prev.blocks.length - 1].timeEnd : null
            // Pause affichée seulement s'il y a un VRAI trou (sections contiguës ou
            // saisie chevauchante → pas de ligne « Pause 13h00 – 13h00 » / inversée).
            const pauseStart = prevEnd && toMin(first.timeStart) > toMin(prevEnd) ? prevEnd : null
            return (
              <div key={group.section} className="flex flex-col gap-3">
                {pauseStart && (
                  <div className="py-1 text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Pause {fmtTime(pauseStart)} – {fmtTime(first.timeStart)}
                    </p>
                    {data.pauseNote && (
                      <p className="mt-0.5 text-xs text-muted-foreground/70">{data.pauseNote}</p>
                    )}
                  </div>
                )}
                <div className="flex items-baseline gap-3">
                  <h2 className="text-lg font-semibold uppercase tracking-wide">
                    {SECTION_LABELS[group.section]}
                  </h2>
                  <span className="text-sm font-medium tabular-nums text-muted-foreground">
                    {fmtTime(first.timeStart)} → {fmtTime(last.timeEnd)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground/70">
                    {fmtDuration(sectionMin)}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {group.blocks.map((b) => (
                    <div
                      key={b.id}
                      className="relative flex rounded-xl border border-l-4"
                      // Liseré latéral : même effet que le border-t-4 des KPI cards.
                      style={{ borderLeftColor: b.color }}
                    >
                      <div className="flex w-32 shrink-0 flex-col justify-center gap-0.5 border-r px-4 py-3 sm:w-40">
                        <span className="font-semibold tabular-nums">
                          {fmtTime(b.timeStart)} – {fmtTime(b.timeEnd)}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {fmtDuration(durationMin(b.timeStart, b.timeEnd))}
                        </span>
                      </div>
                      {/* pr-20 admin : réserve la place des boutons ✏️/🗑 en absolu. */}
                      <div className={cn('min-w-0 flex-1 px-4 py-3', canEdit && 'pr-20')}>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{b.title}</h3>
                          {b.badge && (
                            <Badge
                              className="border-transparent text-[10px] font-semibold tracking-wider"
                              style={{ backgroundColor: `${b.color}24`, color: b.color }}
                            >
                              {b.badge}
                            </Badge>
                          )}
                        </div>
                        {b.bullets.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {b.bullets.map((t, i) => (
                              <Bullet key={i} text={t} />
                            ))}
                          </ul>
                        )}
                      </div>
                      {canEdit && (
                        <div className="absolute right-2 top-2 flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setEditingBlock(b)}
                            aria-label={`Modifier ${b.title}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <ConfirmDialog
                            title={`Supprimer « ${b.title} » ?`}
                            description="Le bloc est retiré du planning de ce membre."
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-red-600 hover:text-red-700"
                                aria-label={`Supprimer ${b.title}`}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            }
                            onConfirm={async () => {
                              const res = await deleteBlock(b.id)
                              if (!res.success) return res.error
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">
            {data ? 'Aucun planning défini' : 'Aucun membre sélectionné'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {canEdit
              ? data
                ? 'Ajoute un premier bloc pour construire le planning de ce membre.'
                : 'Choisis un membre dans le sélecteur pour créer son planning.'
              : "Ton planning n’est pas encore défini — vois avec un admin."}
          </p>
        </div>
      )}

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
