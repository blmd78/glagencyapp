'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { WheelPrize } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { WheelResult } from '@/components/training/wheel-result'
import { sectorAngles, WheelSvg } from '@/components/training/wheel-svg'
import { playCling, playWheelSpin } from '@/lib/sfx'
import { spinModuleWheel } from '../actions'
import type { ModuleSpinResult } from '../types'

/** Durée de la transition CSS de `WheelSvg` (4,8 s) + une marge pour l'arrêt franc. */
const SPIN_MS = 4900
/**
 * Une Server Action ne REJETTE que sur un échec de transport (réseau coupé, id d'action périmé
 * après un déploiement) — jamais sur une erreur métier, que `runAction` rend en `success: false`.
 * Sans ce filet, la phase resterait bloquée sur « spinning » et le bouton tournerait indéfiniment.
 */
const TRANSPORT_KO = 'Connexion perdue — recharge la page'

type Phase = 'idle' | 'spinning' | 'reveal'

/**
 * La roue des modules, côté CHATTER : il joue pour lui-même, en consommant un tour gagné en
 * finissant un module. Le tirage est décidé par le SERVEUR (`spinModuleWheel`) : ici on anime la
 * roue jusqu'au secteur renvoyé, puis on révèle le montant. Aucune lib — rotation CSS sur le SVG.
 */
export function ModuleWheelSpinner({ segments, tours }: { segments: WheelPrize[]; tours: number }) {
  const router = useRouter()
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ModuleSpinResult | null>(null)
  const timer = useRef<number | null>(null)
  // Verrou SYNCHRONE : `phase` ne vaut 'spinning' qu'au rendu suivant, et le `disabled` du bouton
  // avec lui. Deux clics dans la même frame passeraient donc tous les deux. (La base refuserait
  // le second — `ticket_id` est unique — mais l'utilisateur verrait une erreur pour rien.)
  const busy = useRef(false)

  // Le timer de révélation ne doit pas survivre au démontage (navigation pendant la rotation).
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  // `WheelSvg` parle en `WheelSector` : sur cette roue, aucun secteur n'est perdant.
  const sectors = segments.map((s) => ({ label: s.label, weight: s.weight, lose: false }))

  const spin = async () => {
    if (tours <= 0 || phase !== 'idle' || busy.current) return
    busy.current = true
    setPhase('spinning')
    let r: Awaited<ReturnType<typeof spinModuleWheel>>
    try {
      r = await spinModuleWheel()
    } catch {
      toast.error(TRANSPORT_KO)
      busy.current = false
      setPhase('idle')
      router.refresh()
      return
    }
    if (!r.success) {
      toast.error(r.error)
      busy.current = false
      setPhase('idle')
      router.refresh()
      return
    }
    setResult(r.data)
    const angles = sectorAngles(sectors)
    const a = angles.find((x) => x.index === r.data.segmentIndex) ?? angles[0]
    if (!a) {
      // Config sans aucun poids > 0 : le serveur aurait throw avant d'en arriver là.
      busy.current = false
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
    playWheelSpin(SPIN_MS / 1000)
    timer.current = window.setTimeout(() => {
      playCling()
      setPhase('reveal')
    }, SPIN_MS)
  }

  return (
    <section className="flex flex-col items-center gap-5">
      <WheelSvg sectors={sectors} rotation={rotation} spinning={phase === 'spinning'} />

      <ActionButton
        type="button"
        onClick={() => void spin()}
        pending={phase === 'spinning'}
        disabled={tours <= 0 || phase === 'reveal'}
        className="gla-btn mt-2 h-12 w-full max-w-[250px] border-0 text-[15px] font-bold"
      >
        {tours > 0 ? 'Tourner la roue 🎡' : 'Aucun tour disponible'}
      </ActionButton>

      <p className="text-center text-sm text-[var(--gla-faint)]">
        {tours > 0
          ? `Tu as ${tours} tour${tours > 1 ? 's' : ''} — chaque tour rapporte entre 6 et 8 €.`
          : 'Termine un module (au moins 60 à tous ses exos) pour gagner un tour.'}
      </p>

      {phase === 'reveal' && result && (
        <WheelResult
          reveal={{ won: true, label: result.label, amountEur: result.amountEur }}
          winnerName={null}
          onDone={() => {
            busy.current = false
            setPhase('idle')
            setResult(null)
            // C'est ICI qu'on rafraîchit, pas dans l'action : le compteur de tours et « Mes gains »
            // ne doivent bouger qu'une fois le coffre ouvert.
            router.refresh()
          }}
        />
      )}
    </section>
  )
}
