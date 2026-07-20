'use client'

import { CalendarPlus, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fmtDuration } from '../types'
import type { PlanningData } from '../types'

/**
 * En-tête du planning : sous-titre (temps effectif calculé) + les 2 actions d'ouverture des
 * dialogs. Le titre et le sélecteur de membre (COMMUN au planning et à la to-do) sont montés
 * par `page.tsx`, au-dessus de la barre d'onglets — cf. `member-select.tsx`.
 * Extrait de `planning-view.tsx` (split > 300 lignes, docs/guidelines-standard-feature.md
 * §1) — DOM inchangé hormis le titre (h1 → h2, une seule page ne peut avoir qu'un `<h1>`).
 */
export function PlanningHeader({
  data,
  canEdit,
  totalMin,
  shiftsCount,
  onOpenMeta,
  onAddBlock,
}: {
  data: PlanningData
  /** Cible éditable par le spectateur (on consulte SON propre planning en lecture seule). */
  canEdit: boolean
  totalMin: number
  shiftsCount: number
  onOpenMeta: () => void
  onAddBlock: () => void
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div>
        <h2 className="text-lg font-medium">Planning journalier</h2>
        <p className="text-sm text-muted-foreground">
          {data.profileName}
          {totalMin > 0 && (
            <>
              {' '}· {fmtDuration(totalMin)} de travail effectif · {shiftsCount} shift
              {shiftsCount > 1 ? 's' : ''}
            </>
          )}
        </p>
      </div>
      {canEdit && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onOpenMeta}>
            <SlidersHorizontal className="size-3.5" />
            Priorité & annexes
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onAddBlock}>
            <CalendarPlus className="size-3.5" />
            Ajouter un bloc
          </Button>
        </div>
      )}
    </div>
  )
}
