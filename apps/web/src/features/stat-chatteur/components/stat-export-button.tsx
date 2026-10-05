'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Period } from '@/lib/period'
import type { RankedChatter } from '../types'
import { downloadRankingImage } from './draw-ranking-image'

/**
 * Télécharge l'image PNG du classement (podium + places 4 à 33). Reçoit déjà les seules lignes
 * utiles ; `total` = nombre de classés sur la période (pied de l'image) ; `model` = classement
 * d'une seule modèle (onglet « Par modèle »).
 */
export function StatExportButton({
  rows,
  total,
  period,
  model,
}: {
  rows: RankedChatter[]
  total: number
  period: Period
  model?: string
}) {
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      await downloadRankingImage(rows, period, total, model)
    } catch {
      toast.error("L'image du classement n'a pas pu être générée")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={onClick}
      disabled={busy || rows.length === 0}
      title="Image PNG à partager : podium + places 4 à 33"
    >
      <Download className="size-4" />
      Exporter
    </Button>
  )
}
