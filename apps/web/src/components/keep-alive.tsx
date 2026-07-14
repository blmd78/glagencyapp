'use client'

import { useEffect } from 'react'

/**
 * Garde l'isolate Workers chaud pendant qu'un onglet CRM est ouvert : ping /api/ping
 * toutes les 4 min + au retour sur l'onglet (visibilitychange) — le cas typique « je
 * reviens après 20 min et le 1ᵉʳ clic prend 3 s » retombe ainsi sur un worker déjà
 * démarré. Prod uniquement (en dev il n'y a pas d'isolate à réchauffer) ; throttle 60 s
 * pour qu'un alt-tab nerveux ne parte pas en rafale. Ne rend rien.
 */
export function KeepAlive() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    let last = 0
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - last < 60_000) return
      last = now
      void fetch('/api/ping', { cache: 'no-store' })
    }
    const id = setInterval(ping, 4 * 60 * 1000)
    document.addEventListener('visibilitychange', ping)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [])
  return null
}
