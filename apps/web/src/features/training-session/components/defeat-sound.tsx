'use client'

import { useEffect } from 'react'
import { playDefeat } from '@/lib/sfx'

/**
 * L'arpège descendant d'une élimination (GLA : `trainEliminate` → `loserSound`). C'est le seul son
 * de la face qui ne récompense rien — et c'est justement celui qui compte : sans enjeu au moment de
 * l'échec, réussir ne procure rien.
 *
 * Réservé au PROPRIÉTAIRE de la session, et joué une seule fois par session de navigation :
 * l'écran reste consultable à son URL, on ne rejoue pas la punition à chaque retour.
 */
export function DefeatSound({ sessionId, viewerIsOwner }: { sessionId: string; viewerIsOwner: boolean }) {
  useEffect(() => {
    if (!viewerIsOwner) return
    const key = `glaDefeatFx_${sessionId}`
    try {
      if (sessionStorage.getItem(key) === '1') return
      sessionStorage.setItem(key, '1')
    } catch {
      // Stockage refusé : le son rejouera au prochain passage, ce n'est pas grave.
    }
    const t = window.setTimeout(playDefeat, 250)
    return () => window.clearTimeout(t)
  }, [sessionId, viewerIsOwner])

  return null
}
