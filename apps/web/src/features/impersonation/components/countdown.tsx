'use client'

import { useEffect, useState } from 'react'
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
  const [remainingMs, setRemainingMs] = useState(() => expiresAt - Date.now())

  useEffect(() => {
    const tick = () => {
      const left = expiresAt - Date.now()
      setRemainingMs(left)
      if (left <= 0) router.refresh()
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt, router])

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')

  return <span>{mm}:{ss}</span>
}
