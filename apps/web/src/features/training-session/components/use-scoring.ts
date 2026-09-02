'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { callAction } from '@/lib/actions-client'
import { scoreSession } from '../actions-lifecycle'

/** Lance la notation (une fois) puis `router.refresh()` → le RSC bascule sur l'écran de résultat. */
export function useScoring(sessionId: string) {
  const router = useRouter()
  const [scoring, setScoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const run = useCallback(async () => {
    if (started.current) return
    started.current = true
    setScoring(true)
    setError(null)
    const r = await callAction(scoreSession({ sessionId }))
    if (!r.success) {
      // Relançable : on rouvre la porte pour le bouton « Relancer la notation ».
      started.current = false
      setScoring(false)
      setError(r.error)
      return
    }
    router.refresh()
  }, [sessionId, router])
  return { scoring, error, run }
}
