'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Compte à rebours `MM:SS` du bandeau d'impersonation (Task 7). Tick 1 s côté client à
 * partir de `expiresAt` (le `exp` logique signé, pas le cookie). À `≤0`, `router.refresh()`
 * relance `getImpersonationState()` côté serveur : `isExpired` devient vrai → redirect
 * teardown (`/impersonation/stop`). Le tick ne déclenche donc PAS lui-même le teardown, il
 * se contente de provoquer le prochain rendu serveur qui, lui, le fera.
 */
export function Countdown({ expiresAt }: { expiresAt: number }) {
  const router = useRouter()
  // `null` au 1er rendu : serveur et hydratation client rendent le MÊME placeholder (« --:-- »)
  // → aucun mismatch. La vraie valeur (qui dépend de `Date.now()`) n'est calculée qu'APRÈS
  // montage, côté client. Vrai fix du warning d'hydratation, sans le masquer.
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  // Garde : ne déclencher le refresh qu'UNE fois à l'expiration (sinon router.refresh() à
  // chaque tick = rafale de /impersonation/stop concurrents).
  const refreshedRef = useRef(false)

  useEffect(() => {
    const tick = () => {
      const left = expiresAt - Date.now()
      setRemainingMs(left)
      if (left <= 0 && !refreshedRef.current) {
        refreshedRef.current = true
        router.refresh()
      }
    }
    tick() // valeur immédiate au montage (pas d'attente d'1 s)
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt, router])

  if (remainingMs === null) return <span>--:--</span>
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')

  return <span>{mm}:{ss}</span>
}
