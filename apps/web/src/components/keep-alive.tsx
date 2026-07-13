'use client'

import { useEffect } from 'react'

/**
 * Garde l'isolate Workers chaud pendant qu'un onglet CRM est ouvert : ping /api/ping
 * toutes les 4 min + au retour sur l'onglet (visibilitychange) — le cas typique « je
 * reviens après 20 min et le 1ᵉʳ clic prend 3 s » retombe ainsi sur un worker déjà
 * démarré. Ne rend rien ; coût réseau négligeable (204 sans corps).
 */
export function KeepAlive() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === 'visible') void fetch('/api/ping', { cache: 'no-store' })
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
