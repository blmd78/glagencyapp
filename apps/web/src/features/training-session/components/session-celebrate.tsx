'use client'

import { useEffect } from 'react'
import { MEDAL_OR } from '@glagency/core'
import { bigConfetti, burstConfetti } from '@/lib/confetti'
import { playVictory } from '@/lib/sfx'

/**
 * La fête de fin de cas — le moment où la dopamine compte le plus : juste après l'effort, pas en
 * revenant plus tard sur une page de suivi. Reprise de l'app Good Luck Agency, qui déclenche
 * `bigCelebrate()` dès 85/100 (`index.html:1914`).
 *
 *  - médaille Or (≥ 85) : triple salve + jingle ;
 *  - simple record battu : une salve, sans son (ça arrive souvent, un son à chaque fois lasse).
 *
 * Réservé au PROPRIÉTAIRE de la session : un encadrant qui relit la session d'un chatter n'a pas à
 * recevoir des confettis pour une note qui n'est pas la sienne.
 *
 * `sessionStorage` par session : l'écran de résultat reste consultable indéfiniment à son URL —
 * sans ce garde-fou, chaque retour sur la page relancerait la fête.
 */
export function SessionCelebrate({
  sessionId,
  total,
  improved,
  viewerIsOwner,
}: {
  sessionId: string
  total: number | null
  /** Record personnel battu sur ce cas (delta d'XP > 0). */
  improved: boolean
  viewerIsOwner: boolean
}) {
  useEffect(() => {
    if (!viewerIsOwner || total == null) return
    const gold = total >= MEDAL_OR
    if (!gold && !improved) return

    const key = `glaSessFx_${sessionId}`
    try {
      if (sessionStorage.getItem(key) === '1') return
      sessionStorage.setItem(key, '1')
    } catch {
      // Stockage refusé : on fête quand même, quitte à refêter au prochain passage.
    }

    // Laisse la jauge se dessiner (1,1 s) avant les confettis : les deux en même temps se mangent.
    const timer = window.setTimeout(() => {
      if (gold) {
        bigConfetti()
        playVictory()
        return
      }
      burstConfetti()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [sessionId, total, improved, viewerIsOwner])

  return null
}
