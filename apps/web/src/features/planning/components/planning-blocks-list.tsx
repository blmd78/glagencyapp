'use client'

import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deleteBlock } from '../actions'
import { SECTION_LABELS, durationMin, fmtDuration, fmtTime, toMin } from '../types'
import type { PlanningBlock, PlanningData, PlanningSection } from '../types'

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
 * Sections + pauses (déduites du trou entre deux sections) + blocs horaires, édition
 * admin (crayon/suppression). Extrait de `planning-view.tsx` (split > 300 lignes,
 * docs/guidelines-standard-feature.md §1) — DOM inchangé.
 */
export function PlanningBlocksList({
  data,
  bySection,
  canEdit,
  onEdit,
}: {
  data: PlanningData | null
  bySection: { section: PlanningSection; blocks: PlanningBlock[] }[]
  canEdit: boolean
  onEdit: (block: PlanningBlock) => void
}) {
  if (!data || bySection.length === 0) {
    return (
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
    )
  }

  return (
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
                        onClick={() => onEdit(b)}
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
                          if (!res.success) {
                            toast.error(res.error)
                            return res.error
                          }
                          toast.success('Bloc supprimé')
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
  )
}
