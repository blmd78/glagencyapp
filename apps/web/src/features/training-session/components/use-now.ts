'use client'

import { useEffect, useState } from 'react'

/**
 * Horloge alignée sur le serveur (offset calculé au montage) — les timers (chrono, révélation) s'y
 * calent. DÉVIATION vs brief : pas de `setNow` synchrone dans l'effet (règle
 * `react-hooks/set-state-in-effect`, erreur ESLint) — l'état initial vaut déjà l'heure serveur du
 * rendu, et le premier tick (≤ `tickMs`) applique l'offset.
 */
export function useNow(serverNow: string, tickMs = 250): number {
  const [now, setNow] = useState(() => Date.parse(serverNow))
  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now()
    const id = setInterval(() => setNow(Date.now() + offset), tickMs)
    return () => clearInterval(id)
  }, [serverNow, tickMs])
  return now
}
