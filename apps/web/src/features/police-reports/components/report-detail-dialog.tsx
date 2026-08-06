'use client'

// Détail d'un rapport en DIALOG, ouvert par le crayon en bout de ligne — remplace l'accordéon
// de la table (retour Benoit 2026-08-06 : on n'y voyait pas tout d'un coup). Lecture seule :
// chiffres du soir, alerte, suivi par chatteur (mêmes empilements que la saisie — « A marché »
// puis « À régler », sans icônes). « Modifier » (si fourni par la table : sa propre fiche, en
// vue jour) referme ce détail et rouvre la modal de saisie préchargée sur le modèle.

import { useState } from 'react'
import { Pencil, TriangleAlert } from 'lucide-react'
import { frTimeShort, frWeekdayLong } from '@glagency/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { STATUS_COLORS } from '@/lib/status-color'
import { eur, num } from '@/lib/format'
import { modelColor } from '@/lib/model-color'
import type { PoliceReport } from '../types'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function ReportDetail({
  report,
  onEdit,
}: {
  report: PoliceReport
  /** Fourni = « Modifier » affiché (sa propre fiche, vue jour) — referme le détail et rouvre la
   *  saisie préchargée. */
  onEdit?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          title="Voir le rapport"
        >
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Rapport
            <Badge className={modelColor(report.creatorName)}>{report.creatorName}</Badge>
          </DialogTitle>
          <DialogDescription>
            <span className="capitalize">{frWeekdayLong(report.day)}</span>
            {report.authorName ? ` · ${report.authorName}` : ''} · {frTimeShort(report.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="CA du jour" value={eur(report.ca)} />
            <Stat label="Non traitées" value={num(report.nonTraitees)} />
            <Stat label="Absents" value={num(report.absents)} />
          </div>

          {report.alerte && (
            <div>
              <Badge
                className={`${STATUS_COLORS.warning} h-auto items-start gap-1.5 py-1 text-left font-normal whitespace-normal`}
              >
                <TriangleAlert className="size-3.5 shrink-0 translate-y-0.5" />
                <span>
                  <span className="font-medium">Alerte</span> {report.alerte}
                </span>
              </Badge>
            </div>
          )}

          {report.lines.length > 0 && (
            <div className="flex flex-col gap-3">
              {report.lines.map((line) => (
                <div key={line.id} className="flex flex-col gap-1.5 rounded-lg border p-3">
                  <span className="text-sm font-medium">{line.chatterName}</span>
                  {!line.aMarche && !line.aRegler && (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                  {line.aMarche && (
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground">A marché</span>
                      <p>{line.aMarche}</p>
                    </div>
                  )}
                  {line.aRegler && (
                    <div className="text-sm">
                      <span className="text-xs text-muted-foreground">À régler</span>
                      <p>{line.aRegler}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {onEdit && (
            <Button
              type="button"
              className="self-end"
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
            >
              Modifier
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
