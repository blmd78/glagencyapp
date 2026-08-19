'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ActionButton } from '@/components/action-button'
import { claimTicket, spinWheel } from '../actions'
import type { SpinResult, WheelData } from '../types'
import { WheelResult } from './wheel-result'
import { sectorAngles, WheelSvg } from './wheel-svg'

/** Durée de la transition CSS de `WheelSvg` (4,8 s) + une marge pour l'arrêt franc. */
const SPIN_MS = 4900

type Phase = 'idle' | 'claiming' | 'spinning' | 'reveal' | 'done'

/**
 * Le tirage est décidé par le SERVEUR (`spinWheel`) : ici on anime la roue jusqu'au secteur
 * renvoyé, puis on révèle le lot. Aucune lib — rotation CSS sur le SVG, carte de résultat en
 * `animate-in` (tw-animate-css).
 */
export function WheelSpinner({ data }: { data: WheelData }) {
  const router = useRouter()
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<SpinResult | null>(null)
  // Le ticket vient des PROPS (re-rendues à chaque `router.refresh()`) et pas d'un état copié :
  // un `useState(data.ticket)` resterait figé à `null` après la réclamation. `spent` = consommé
  // ICI, le temps que le rafraîchissement serveur arrive.
  const [spent, setSpent] = useState(false)
  const ticket = spent ? null : data.ticket
  const claimed = useRef(false)
  const timer = useRef<number | null>(null)

  // Éligible sans ticket → réclamer UNE fois au montage (le serveur revérifie le top 3), puis
  // rafraîchir : le ticket redescend par les props.
  useEffect(() => {
    if (!data.eligible || data.ticket || claimed.current) return
    claimed.current = true
    setPhase('claiming')
    void claimTicket().then((r) => {
      setPhase('idle')
      if (r.success && r.data.ticketId) router.refresh()
    })
  }, [data.eligible, data.ticket, router])

  // Le timer de révélation ne doit pas survivre au démontage (navigation pendant la rotation).
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  const spin = async () => {
    if (!ticket || phase !== 'idle') return
    setPhase('spinning')
    const r = await spinWheel({ ticketId: ticket.id })
    if (!r.success) {
      toast.error(r.error)
      setPhase('idle')
      router.refresh()
      return
    }
    setResult(r.data)
    const angles = sectorAngles(data.config.sectors)
    const a = angles.find((x) => x.index === r.data.sectorIndex) ?? angles[0]
    if (!a) {
      // Config sans aucun poids > 0 : le serveur aurait throw avant d'en arriver là.
      setPhase('idle')
      router.refresh()
      return
    }
    // Angle cible = un point ALÉATOIRE dans le secteur (jamais pile au milieu : ça se voit).
    const target = a.a0 + (a.a1 - a.a0) * (0.15 + Math.random() * 0.7)
    // Pointeur en haut (0°) : amener le secteur sous le pointeur = tourner de −target. Les deux
    // `((x % 360) + 360) % 360` évitent le modulo négatif ; +5 tours pour le spectacle. La
    // rotation ne fait que CROÎTRE — la transition CSS ne repart jamais en arrière.
    const current = ((rotation % 360) + 360) % 360
    const targetMod = ((-target % 360) + 360) % 360
    setRotation(rotation + ((targetMod - current + 360) % 360) + 5 * 360)
    setSpent(true)
    timer.current = window.setTimeout(() => setPhase('reveal'), SPIN_MS)
  }

  const hint = ticket
    ? `Un tour disponible — ${ticket.reason}`
    : data.eligible
      ? 'Ton tour arrive…'
      : 'Termine dans le top 3 du classement de la semaine pour gagner un tour.'

  return (
    <section className="flex flex-col items-center gap-5">
      <WheelSvg sectors={data.config.sectors} rotation={rotation} spinning={phase === 'spinning'} />
      <ActionButton
        type="button"
        onClick={() => void spin()}
        pending={phase === 'spinning' || phase === 'claiming'}
        disabled={!ticket || phase === 'reveal'}
      >
        Tourner la roue 🎡
      </ActionButton>
      <p className="text-center text-sm text-muted-foreground">{hint}</p>
      {phase === 'reveal' && result && (
        <WheelResult
          result={result}
          onDone={() => {
            setPhase('done')
            router.refresh()
          }}
        />
      )}
    </section>
  )
}
