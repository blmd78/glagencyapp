'use client'

import { useState } from 'react'
import { ActionButton } from '@/components/action-button'

/** Endpoint de mesure GLA : 50 Mo servis par Cloudflare, lus en flux. */
const DOWNLOAD_URL = 'https://speed.cloudflare.com/__down?bytes=50000000'
/** Plafond GLA : au-delà de 12 s on coupe et on calcule sur ce qui est déjà arrivé. */
const MAX_MS = 12_000
/** Rafraîchissement de l'affichage : le flux rend des morceaux bien plus vite que l'œil ne suit. */
const PAINT_MS = 200

const MEASURE_KO = 'Impossible de mesurer — vérifie ta connexion et réessaie.'

/**
 * Connexion internet — mesure GLA reprise telle quelle : un téléchargement Cloudflare lu par
 * `ReadableStream`, le débit affiché en direct, coupure à 12 s. Aucun seuil côté client : le
 * chiffre part au serveur, qui garde le gate (spec §2).
 */
export function StepConnection({
  onDone,
}: {
  /** Rend `false` si l'enregistrement a échoué — l'écran propose alors de réessayer. */
  onDone: (mbps: number) => Promise<boolean>
}) {
  const [running, setRunning] = useState(false)
  const [mbps, setMbps] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setError(null)
    setMbps(null)
    try {
      const t0 = performance.now()
      const response = await fetch(`${DOWNLOAD_URL}&t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok || !response.body) throw new Error('flux indisponible')
      const reader = response.body.getReader()
      let received = 0
      let painted = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.length
        const now = performance.now()
        if (now - painted > PAINT_MS) {
          painted = now
          setMbps(Math.round(((received * 8) / ((now - t0) / 1000) / 1e6) * 10) / 10)
        }
        if (now - t0 > MAX_MS) {
          await reader.cancel().catch(() => {})
          break
        }
      }
      // Zéro octet reçu = la mesure n'a pas eu lieu ; l'enregistrer donnerait un 0 Mbps qui
      // ferait échouer le candidat sur une panne réseau, pas sur sa connexion.
      if (received === 0) throw new Error('aucune donnée reçue')
      const final = Math.round(((received * 8) / ((performance.now() - t0) / 1000) / 1e6) * 10) / 10
      setMbps(final)
      const ok = await onDone(final)
      if (!ok) setError('Ta mesure n’a pas pu être enregistrée — réessaie.')
    } catch {
      setError(MEASURE_KO)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h2 className="text-lg font-semibold tracking-tight">Test de connexion internet</h2>
      <p className="text-sm text-muted-foreground">
        On mesure automatiquement ta vitesse de téléchargement. Ne ferme pas la page pendant la mesure.
      </p>

      <div className="py-4">
        <p className="text-4xl leading-none font-semibold tabular-nums">{mbps === null ? '—' : mbps.toFixed(1)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Mbps · {running ? 'mesure en cours…' : mbps === null ? 'prêt à tester' : 'mesure terminée'}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <ActionButton className="w-full" pending={running} onClick={() => void run()}>
        {error ? 'Relancer le test' : 'Lancer le test'}
      </ActionButton>
    </div>
  )
}
