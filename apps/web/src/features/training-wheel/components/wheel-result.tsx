'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { eur } from '@/lib/format'
import type { SpinResult } from '../types'

/**
 * Révélation du résultat, une fois la roue arrêtée. Raté → la carte tout de suite ; gagné → le
 * « coffre » (🎁) puis, 450 ms plus tard, la carte du lot (patron GLA : un temps entre l'arrêt de
 * la roue et l'ouverture). Aucun tirage ici : `result` vient du serveur, ce composant n'affiche.
 */
export function WheelResult({ result, onDone }: { result: SpinResult; onDone: () => void }) {
  const [chest, setChest] = useState(false)
  useEffect(() => {
    if (!result.won) return
    const t = window.setTimeout(() => setChest(true), 450)
    return () => window.clearTimeout(t)
  }, [result.won])

  if (!result.won) {
    return (
      <div role="status" className="flex w-full max-w-sm flex-col items-center gap-2 rounded-xl border p-5 text-center">
        <span aria-hidden="true" className="text-4xl">
          😅
        </span>
        <p className="text-lg font-semibold">Raté !</p>
        <p className="text-sm text-muted-foreground">Pas de lot cette fois — retente ta chance la semaine prochaine.</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onDone}>
          OK
        </Button>
      </div>
    )
  }

  if (!chest) {
    // Le coffre : un temps mort volontaire, la carte du lot arrive juste après.
    return (
      <div role="status" className="flex w-full max-w-sm flex-col items-center gap-2 p-5 text-center">
        <span aria-hidden="true" className="animate-in zoom-in-50 text-5xl duration-300">
          🎁
        </span>
        <span className="sr-only">Tu as gagné — ouverture du lot…</span>
      </div>
    )
  }

  return (
    <div
      role="status"
      className="flex w-full max-w-sm animate-in flex-col items-center gap-2 rounded-xl border p-5 text-center duration-500 fade-in zoom-in-95"
    >
      <span aria-hidden="true" className="text-4xl">
        🎁
      </span>
      <p className="text-sm text-muted-foreground">Tu gagnes</p>
      <p className="text-lg font-semibold">{result.prize?.label ?? result.sectorLabel}</p>
      {result.prize?.amountEur != null && <p className="text-2xl font-semibold tabular-nums">{eur(result.prize.amountEur)}</p>}
      <p className="text-sm text-muted-foreground">Ton gain est enregistré — l’agence te le versera / l’appliquera.</p>
      <Button type="button" size="sm" className="mt-2" onClick={onDone}>
        OK
      </Button>
    </div>
  )
}
