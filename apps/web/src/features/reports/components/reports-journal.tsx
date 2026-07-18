'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { frWeekdayDate } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { ReportForm } from './report-form'
import type { Report } from '../types'

/**
 * Journal : UN compte rendu à la fois, navigation par date (◂ précédent / suivant ▸). Jours
 * navigables = ceux qui ont un CR (+ aujourd'hui si on peut le rédiger), antéchrono. Le jour
 * courant est éditable (form) pour son auteur ; tout le reste est en LECTURE SEULE.
 */
export function ReportsJournal({
  reports,
  today,
  canWriteToday,
  isSelf,
  targetName,
}: {
  reports: Report[]
  today: string
  /** L'auteur peut rédiger SON CR du jour (vue « moi », hors superadmin). */
  canWriteToday: boolean
  isSelf: boolean
  targetName: string
}) {
  // Jours navigables, antéchrono (idx 0 = le plus récent). On ajoute aujourd'hui si on peut le
  // rédiger, même sans CR encore (pour l'écrire) ; les jours vides du passé sont ignorés.
  const days = useMemo(() => {
    const set = new Set(reports.map((r) => r.day))
    if (canWriteToday) set.add(today)
    return [...set].sort().reverse()
  }, [reports, canWriteToday, today])

  const [idx, setIdx] = useState(0)

  if (days.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {isSelf
          ? 'Aucun compte rendu.'
          : `Aucun compte rendu de ${targetName} sur les 30 derniers jours.`}
      </div>
    )
  }

  const day = days[Math.min(idx, days.length - 1)]
  const current = reports.find((r) => r.day === day) ?? null
  const editable = canWriteToday && day === today

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          disabled={idx >= days.length - 1}
          onClick={() => setIdx((i) => i + 1)}
        >
          <ChevronLeft className="size-4" /> Précédent
        </Button>
        <span className="text-sm font-semibold capitalize">
          {frWeekdayDate(day)}
          {day === today && ' · aujourd’hui'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          disabled={idx <= 0}
          onClick={() => setIdx((i) => i - 1)}
        >
          Suivant <ChevronRight className="size-4" />
        </Button>
      </div>

      {editable ? (
        <ReportForm initialContent={current?.content ?? ''} />
      ) : (
        <div className="rounded-xl border p-4 sm:p-5">
          <p className="whitespace-pre-wrap text-sm">{current?.content}</p>
        </div>
      )}
    </div>
  )
}
