'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DayColumn, type DayColumnProps } from './day-column'
import { TodoDnd } from './todo-dnd'
import type { TodoDay } from '../types'

/**
 * Une journée seule, en grand, par-dessus la semaine (#162 — décision de Benoit, 2026-10-12 : une
 * pop-up, pas une vue qui remplace la semaine). C'est la MÊME colonne que dans la grille
 * (`DayColumn`), avec les mêmes gestes : ajouter, cocher, ouvrir une tâche, sections, jour de
 * repos, et réordonner — dans la journée seulement ; pour changer de jour, la semaine ou le champ
 * « Jour » de la tâche.
 *
 * Son propre contexte de glisser-déposer (`TodoDnd`) : la journée est rendue deux fois quand la
 * pop-up est ouverte, et la grille en dessous a déjà ses cibles. Le débrief, le bloc-notes et les
 * liens restent sur la page, sous la pop-up.
 */
export function DayDialog({
  day,
  column,
  onMove,
  onPrev,
  onNext,
  onClose,
  children,
}: {
  day: TodoDay | null
  column: Omit<DayColumnProps, 'day' | 'onOpenDay'>
  onMove: (taskId: string, move: { date: string; category: string; beforeId: string | null }) => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  /** La question « juste aujourd'hui », quand elle porte sur une tâche de la pop-up. */
  children?: ReactNode
}) {
  return (
    <Dialog open={day !== null} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="trk ddlg">
        {day ? (
          <>
            <DialogTitle className="sr-only">
              {day.weekdayLabel} {day.dayLabel}
            </DialogTitle>
            <DialogDescription className="sr-only">La journée seule, avec ses tâches.</DialogDescription>
            {/* La navigation SEGMENTÉE de la semaine (`.seg`, en-tête de la page), pour les jours. */}
            <div className="seg justify-self-start">
              <button type="button" aria-label="Jour précédent" onClick={onPrev}>
                ‹
              </button>
              <button type="button" aria-label="Jour suivant" onClick={onNext}>
                ›
              </button>
            </div>
            <TodoDnd days={[day]} onMove={onMove}>
              <DayColumn day={day} {...column} />
            </TodoDnd>
            {children}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
