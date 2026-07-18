'use client'

import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { frWeekdayDate } from '@glagency/core'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteReport } from '../actions'
import type { Report } from '../types'

/** Cartes antéchrono d'une personne — le contenu respecte les sauts de ligne. Suppression
 *  (ConfirmDialog) uniquement sur ses propres CR (`canDelete`) ; la RLS reste le vrai verrou. */
export function ReportsList({
  reports,
  canDelete,
  emptyLabel,
}: {
  reports: Report[]
  canDelete: boolean
  emptyLabel: string
}) {
  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {reports.map((r) => (
        <div key={r.id} className="rounded-xl border p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold capitalize">{frWeekdayDate(r.day)}</h2>
            {canDelete && (
              <ConfirmDialog
                title="Supprimer ce compte rendu ?"
                description="Le compte rendu de ce jour sera définitivement retiré."
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-red-600 hover:text-red-700"
                    aria-label={`Supprimer le compte rendu du ${frWeekdayDate(r.day)}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
                onConfirm={async () => {
                  const res = await deleteReport(r.id)
                  if (!res.success) {
                    toast.error(res.error)
                    return res.error
                  }
                  toast.success('Compte rendu supprimé')
                }}
              />
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{r.content}</p>
        </div>
      ))}
    </div>
  )
}
