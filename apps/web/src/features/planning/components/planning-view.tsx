'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { BlockDialog } from './block-dialog'
import { PlanningBlocksList } from './planning-blocks-list'
import { PlanningHeader } from './planning-header'
import { PLANNING_DAYS, SECTIONS, durationMin } from '../types'
import type { PlanningBlock, PlanningData, PlanningDay } from '../types'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Planning journalier — chacun lit LE SIEN (RLS) ; édition réservée aux rôles gérants
 * (admin/superadmin, et manager sur ses sous-managers directs). Les plages de section et
 * les pauses sont CALCULÉES des blocs. Un sélecteur de jour filtre les blocs : un bloc sans
 * restriction (`days` vide) vaut pour tous les jours ; un bloc restreint n'apparaît que les
 * jours cochés. Le warning react-hooks/exhaustive-deps (dépendance `blocks`) est préexistant.
 */
export function PlanningView({
  data,
  canEdit,
  nested = false,
  onChanged,
}: {
  data: PlanningData
  /** Édition de la cible (on ne modifie pas SON propre planning, sauf superadmin). */
  canEdit: boolean
  /** Rendu dans un accordéon : le nom est déjà sur la ligne qui ouvre, l'en-tête ne le répète
   *  pas et descend d'un niveau de titre (même patron que `report-panel.tsx`). */
  nested?: boolean
  /**
   * Un bloc vient d'être ajouté, modifié ou supprimé. Indispensable quand `data` vit en ÉTAT
   * CLIENT (pile d'accordéons, chargée à la demande) : `revalidatePath` ne repatche que l'arbre
   * serveur, le planning affiché resterait sur l'instantané d'avant la mutation. Inutile en vue
   * filtrée, où `data` vient des props serveur.
   */
  onChanged?: () => void
}) {
  const [editingBlock, setEditingBlock] = useState<PlanningBlock | 'new' | null>(null)
  const [day, setDay] = useState<PlanningDay>('lundi')

  const blocks = data.blocks
  const visibleBlocks = useMemo(
    () => blocks.filter((b) => b.days.length === 0 || b.days.includes(day)),
    [blocks, day],
  )
  const bySection = useMemo(
    () =>
      SECTIONS.map((s) => ({
        section: s,
        blocks: visibleBlocks.filter((b) => b.section === s),
      })).filter((g) => g.blocks.length > 0),
    [visibleBlocks],
  )
  const totalMin = visibleBlocks.reduce((s, b) => s + durationMin(b.timeStart, b.timeEnd), 0)

  return (
    <div className="flex flex-col gap-6">
      <PlanningHeader
        data={data}
        canEdit={canEdit}
        nested={nested}
        totalMin={totalMin}
        shiftsCount={bySection.length}
        onAddBlock={() => setEditingBlock('new')}
      />

      {/* Sélecteur de jour — filtre les blocs (un bloc sans restriction vaut pour tous les jours). */}
      <div className="flex flex-wrap gap-1.5">
        {PLANNING_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
              day === d
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {cap(d)}
          </button>
        ))}
      </div>

      <PlanningBlocksList
        bySection={bySection}
        canEdit={canEdit}
        onEdit={(b) => setEditingBlock(b)}
        onDeleted={onChanged}
      />

      {canEdit && (
        <BlockDialog
          profileId={data.profileId}
          block={editingBlock !== 'new' ? editingBlock : null}
          open={editingBlock !== null}
          onClose={() => setEditingBlock(null)}
          onSaved={onChanged}
        />
      )}
    </div>
  )
}
