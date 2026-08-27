'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Rafraîchissement du board en arrière-plan.
 *
 * `router.refresh()` ne re-télécharge que la charge RSC — pas le document, pas le CSS, pas le JS.
 * Leur runtime rechargeait la page entière (`autoRefresh(sec)` → `location.reload()`).
 *
 * S'ARRÊTE quand l'onglet passe en arrière-plan : un board ouvert dans un onglet oublié
 * interrogerait la base toute la nuit pour personne. C'est ce que faisait déjà leur version, et
 * c'est la seule raison pour laquelle ils avaient renoncé à `<meta refresh>`.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = (): void => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const start = (): void => {
      stop()
      timer = setInterval(() => router.refresh(), seconds * 1000)
    }
    const onVisibility = (): void => {
      if (document.hidden) stop()
      else {
        router.refresh() // rattrape ce qu'on a manqué pendant l'absence
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router, seconds])

  return null
}
