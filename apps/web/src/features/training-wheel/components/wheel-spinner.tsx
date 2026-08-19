'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { WheelSector } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { claimTicket, spinWheel } from '../actions'
import type { SpinResult, WheelTicket } from '../types'
import { WheelResult } from './wheel-result'
import { sectorAngles, WheelSvg } from './wheel-svg'

/** Durée de la transition CSS de `WheelSvg` (4,8 s) + une marge pour l'arrêt franc. */
const SPIN_MS = 4900
/**
 * Une Server Action ne REJETTE que sur un échec de transport (réseau coupé, id d'action périmé
 * après un déploiement) — jamais sur une erreur métier, que `runAction` rend en `success: false`.
 * Sans ce filet, la phase resterait bloquée sur « claiming »/« spinning » et le bouton tournerait
 * indéfiniment.
 */
const TRANSPORT_KO = 'Connexion perdue — recharge la page'

type Phase = 'idle' | 'claiming' | 'spinning' | 'reveal' | 'done'

/**
 * Le tirage est décidé par le SERVEUR (`spinWheel`) : ici on anime la roue jusqu'au secteur
 * renvoyé, puis on révèle le lot. Aucune lib — rotation CSS sur le SVG, carte de résultat en
 * `animate-in` (tw-animate-css).
 *
 * Props MINIMALES (pas le `WheelData` entier) : « Mes gains » peut porter 50 tirages, ils n'ont
 * rien à faire dans la charge RSC sérialisée vers le client.
 */
export function WheelSpinner({
  sectors,
  ticket: serverTicket,
  eligible,
}: {
  sectors: WheelSector[]
  ticket: WheelTicket | null
  eligible: boolean
}) {
  const router = useRouter()
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<SpinResult | null>(null)
  // Le ticket vient des PROPS (re-rendues à chaque `router.refresh()`) et pas d'un état copié :
  // un `useState(serverTicket)` resterait figé à `null` après la réclamation. `spent` = consommé
  // ICI, le temps que le rafraîchissement serveur arrive.
  const [spent, setSpent] = useState(false)
  const ticket = spent ? null : serverTicket
  const claimed = useRef(false)
  const timer = useRef<number | null>(null)

  // Éligible sans ticket → réclamer UNE fois au montage (le serveur revérifie le top 3), puis
  // rafraîchir : le ticket redescend par les props.
  useEffect(() => {
    if (!eligible || serverTicket || claimed.current) return
    claimed.current = true
    setPhase('claiming')
    void (async () => {
      try {
        const r = await claimTicket()
        // Refus métier (impersonation, droit retiré) : le dire, plutôt qu'un « Ton tour arrive… »
        // qui ne viendrait jamais.
        if (!r.success) toast.error(r.error)
        else if (r.data.ticketId) router.refresh()
      } catch {
        toast.error(TRANSPORT_KO)
      } finally {
        // `claimed` reste à `true` : on ne boucle pas sur une réclamation qui échoue. Un
        // rechargement (ou un `router.refresh()`) remonte le composant et retentera.
        setPhase('idle')
      }
    })()
  }, [eligible, serverTicket, router])

  // Le timer de révélation ne doit pas survivre au démontage (navigation pendant la rotation).
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  const spin = async () => {
    if (!ticket || phase !== 'idle') return
    setPhase('spinning')
    let r: Awaited<ReturnType<typeof spinWheel>>
    try {
      r = await spinWheel({ ticketId: ticket.id })
    } catch {
      // Le ticket a PEUT-ÊTRE été consommé côté serveur : rafraîchir pour repartir de l'état vrai.
      toast.error(TRANSPORT_KO)
      setPhase('idle')
      router.refresh()
      return
    }
    if (!r.success) {
      toast.error(r.error)
      setPhase('idle')
      router.refresh()
      return
    }
    setResult(r.data)
    const angles = sectorAngles(sectors)
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
    : eligible
      ? 'Ton tour arrive…'
      : 'Termine dans le top 3 du classement de la semaine pour gagner un tour.'

  return (
    <section className="flex flex-col items-center gap-5">
      <WheelSvg sectors={sectors} rotation={rotation} spinning={phase === 'spinning'} />
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
