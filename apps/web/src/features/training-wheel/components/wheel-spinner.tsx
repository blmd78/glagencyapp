'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { WheelSector } from '@glagency/core'
import { ActionButton } from '@/components/action-button'
import { Combobox } from '@/components/ui/combobox'
import { playCling, playWheelSpin } from '@/lib/sfx'
import { spinWheel } from '../actions'
import type { SpinResult } from '../types'
import type { SpinnableChatter } from '../services/get-spinnable-chatters'
import { WheelResult } from '@/components/training/wheel-result'
import { sectorAngles, WheelSvg } from '@/components/training/wheel-svg'

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
 * La roue, côté ENCADRANT : il choisit un chatteur et lance pour lui — en partage d'écran (règle du
 * 2026-08-24). Il n'y a plus de ticket, donc plus de file d'attente ni d'éligibilité : le tour est
 * donné, pas gagné.
 *
 * Le tirage est décidé par le SERVEUR (`spinWheel`) : ici on anime la roue jusqu'au secteur
 * renvoyé, puis on révèle le lot. Aucune lib — rotation CSS sur le SVG.
 */
export function WheelSpinner({ sectors, chatters }: { sectors: WheelSector[]; chatters: SpinnableChatter[] }) {
  const router = useRouter()
  const [rotation, setRotation] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<SpinResult | null>(null)
  const [forProfileId, setForProfileId] = useState('')
  const timer = useRef<number | null>(null)
  // Verrou SYNCHRONE : `phase` ne vaut 'spinning' qu'au rendu suivant, et le `disabled` du bouton
  // avec lui. Deux clics dans la même frame passeraient donc tous les deux — soit deux gains
  // versés pour un double-clic accidentel. Une ref est lue et posée immédiatement.
  const busy = useRef(false)

  // Le timer de révélation ne doit pas survivre au démontage (navigation pendant la rotation).
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  const cible = chatters.find((c) => c.profileId === forProfileId) ?? null

  const spin = async () => {
    if (!cible || phase !== 'idle' || busy.current) return
    busy.current = true
    setPhase('spinning')
    let r: Awaited<ReturnType<typeof spinWheel>>
    try {
      r = await spinWheel({ forProfileId: cible.profileId })
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
    const a = angles.find((x) => x.index === r.data.sectorIndex) ?? angles[0]
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
    // Le cliquet démarre AVEC la rotation et se cale sur sa durée ; le « cling » ponctue l'arrêt.
    playWheelSpin(SPIN_MS / 1000)
    timer.current = window.setTimeout(() => {
      playCling()
      setPhase('reveal')
    }, SPIN_MS)
  }

  return (
    <section className="flex flex-col items-center gap-5">
      <div className="flex w-full max-w-sm flex-col gap-1.5">
        <span className="text-sm font-medium">Pour qui ?</span>
        {/* `Combobox` et non `Select` : il porte une RECHERCHE (même composant que côté chatteurs).
            Avec une promo entière dans la liste, dérouler et faire défiler pour trouver un nom est
            plus lent que de taper trois lettres. */}
        <Combobox
          value={forProfileId}
          onChange={setForProfileId}
          disabled={phase !== 'idle'}
          placeholder="Choisis un chatter…"
          searchPlaceholder="Rechercher un chatter…"
          emptyText="Aucun chatter trouvé."
          options={chatters.map((c) => ({ value: c.profileId, label: c.displayName }))}
        />
      </div>

      <WheelSvg sectors={sectors} rotation={rotation} spinning={phase === 'spinning'} />

      <ActionButton
        type="button"
        onClick={() => void spin()}
        pending={phase === 'spinning'}
        disabled={!cible || phase === 'reveal'}
        className="gla-btn mt-2 h-12 w-full max-w-[250px] border-0 text-[15px] font-bold"
      >
        {cible ? `Tourner pour ${cible.displayName} 🎡` : 'Tourner la roue 🎡'}
      </ActionButton>

      <p className="text-center text-sm text-[var(--gla-faint)]">
        {chatters.length === 0
          ? 'Aucun chatter en formation pour l’instant.'
          : 'Le gain est enregistré au nom du chatter, et ton nom reste sur le tirage.'}
      </p>

      {phase === 'reveal' && result && (
        <WheelResult
          // La roue nº 1 est à deux étages : le lot s'il y en a un, sinon le libellé du secteur.
          reveal={{ won: result.won, label: result.prize?.label ?? result.sectorLabel, amountEur: result.prize?.amountEur ?? null }}
          winnerName={cible?.displayName ?? null}
          onDone={() => {
            // Retour à `idle` : l'encadrant enchaîne sur un autre chatter sans recharger.
            busy.current = false
            setPhase('idle')
            setResult(null)
            router.refresh()
          }}
        />
      )}
    </section>
  )
}
