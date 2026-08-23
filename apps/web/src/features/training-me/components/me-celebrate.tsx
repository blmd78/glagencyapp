'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { bigConfetti, burstConfetti } from '@/lib/confetti'
import { playVictory } from '@/lib/sfx'

type Celebration = 'done' | 'rank' | null

export type CelebrateProps = {
  profileId: string
  level: number
  rankTier: number
  rankName: string
  rankEmoji: string
  /** Tous les cas du catalogue validés — la fête ultime, une seule fois dans une vie de chatter. */
  allDone: boolean
  myRank: number | null
  /** Trophées actuellement gagnés (clé + libellé) — sert à repérer les NOUVEAUX depuis la dernière visite. */
  trophies: { key: string; label: string }[]
}

const num = (raw: string | null, fallback: number) => {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`)

/**
 * Les moments de dopamine de Ma formation, repris de l'app Good Luck Agency d'origine
 * (`paintGameHero` / `showFormationComplete`) : montée de niveau, montée de rang, catalogue
 * terminé, places gagnées au classement.
 *
 * Le serveur ne sait pas ce que le chatter a DÉJÀ vu célébrer — rien n'est stocké en base pour ça.
 * Le repère vit donc dans le navigateur, comme chez GLA :
 *  - `localStorage` (niveau, palier de rang, catalogue fini) : une célébration par franchissement,
 *    pas une par visite. Clé préfixée par `profileId` — deux comptes sur le même poste ne se
 *    volent pas leur fête.
 *  - `sessionStorage` (position au classement) : le gain de places se fête une fois par session,
 *    pas à chaque F5.
 *
 * Conséquence assumée : un premier passage sur un nouveau navigateur ne célèbre rien (on enregistre
 * l'état de départ). C'est le comportement GLA — mieux que d'arroser de confettis quelqu'un qui
 * ouvre simplement la page depuis un autre poste.
 *
 * Une seule célébration à la fois, dans l'ordre d'importance : catalogue > rang > niveau.
 */
export function MeCelebrate({ profileId, level, rankTier, rankName, rankEmoji, allDone, myRank, trophies }: CelebrateProps) {
  const [shown, setShown] = useState<Celebration>(null)

  useEffect(() => {
    const kLevel = `glaLvl_${profileId}`
    const kRank = `glaRang_${profileId}`
    const kDone = `glaFormDone_${profileId}`
    const kPos = `glaPos_${profileId}`
    const kTrophies = `glaTrophies_${profileId}`

    let prevLevel = -1
    let prevTier = -1
    let prevPos = 0
    let alreadyDone = false
    // `null` = première visite sur ce navigateur : on enregistre sans rien fêter (même règle que
    // le niveau), sinon huit toasts d'un coup pour des trophées gagnés il y a des semaines.
    let seenTrophies: string[] | null = null
    try {
      prevLevel = num(localStorage.getItem(kLevel), -1)
      prevTier = num(localStorage.getItem(kRank), -1)
      prevPos = num(sessionStorage.getItem(kPos), 0)
      alreadyDone = localStorage.getItem(kDone) === '1'
      const raw = localStorage.getItem(kTrophies)
      seenTrophies = raw ? (JSON.parse(raw) as string[]) : null
    } catch {
      // Stockage refusé (navigation privée, cookies bloqués) : pas de célébration, pas de crash.
      return
    }

    // Délai GLA (450 ms) : la page finit de s'afficher AVANT la fête — une modale qui apparaît
    // dans le même frame que le contenu passe inaperçue. Il garde aussi le `setState` hors du
    // corps synchrone de l'effet (règle `react-hooks/set-state-in-effect`).
    const timer = window.setTimeout(() => {
      // Les repères ne sont posés qu'ICI : en StrictMode le premier effet est annulé par son
      // cleanup, et écrire dès la lecture ferait passer la célébration à la trappe en dev.
      try {
        localStorage.setItem(kLevel, String(level))
        localStorage.setItem(kRank, String(rankTier))
        if (allDone) localStorage.setItem(kDone, '1')
        if (myRank != null) sessionStorage.setItem(kPos, String(myRank))
        localStorage.setItem(kTrophies, JSON.stringify(trophies.map((t) => t.key)))
      } catch {
        // idem : la page reste utilisable, on ne fêtera juste rien.
      }

      // Chaque trophée nouvellement décroché offre un tour de roue (octroyé côté serveur, 0120) :
      // le toast le DIT, sinon le tour arrive en silence dans la barre latérale et personne ne
      // fait le lien avec l'effort qui vient de le déclencher.
      if (seenTrophies) {
        const fresh = trophies.filter((t) => !seenTrophies.includes(t.key))
        for (const t of fresh) toast.success(`🎖️ Trophée débloqué : ${t.label} — un tour de roue t'attend !`)
        if (fresh.length > 0) burstConfetti()
      }

      // Le gain de places se cumule avec une autre célébration (c'est un toast, pas une modale).
      if (myRank != null && prevPos > 0 && myRank < prevPos) {
        const gained = prevPos - myRank
        toast.success(`📈 +${gained} place${gained > 1 ? 's' : ''} — tu es ${ordinal(myRank)} !`)
      }

      if (allDone && !alreadyDone) {
        setShown('done')
        bigConfetti()
        playVictory()
        return
      }
      if (prevTier >= 0 && rankTier > prevTier) {
        setShown('rank')
        bigConfetti()
        playVictory()
        return
      }
      if (prevLevel >= 0 && level > prevLevel) {
        // Montée de niveau : confettis et toast, mais PAS de son — ça arrive tous les 6-7 cas.
        toast.success(`⬆️ Niveau ${level} atteint !`)
        burstConfetti()
      }
    }, 450)

    return () => window.clearTimeout(timer)
  }, [profileId, level, rankTier, allDone, myRank, trophies])

  if (!shown) return null

  return (
    <Dialog open onOpenChange={() => setShown(null)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader className="items-center text-center">
          <span aria-hidden className="text-6xl leading-none">{shown === 'done' ? '🏆' : rankEmoji}</span>
          <DialogTitle className="mt-3 text-2xl">
            {shown === 'done' ? 'Formation terminée !' : 'Nouveau rang débloqué'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {shown === 'done' ? (
              <>
                Tu as validé <b className="text-foreground">tous les cas du catalogue</b>. Préviens ton manager 🎉
              </>
            ) : (
              <>
                Tu passes <b className="text-foreground">{rankName}</b>. Continue comme ça 🔥
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Button onClick={() => setShown(null)} className="w-full">
          Let’s go 🚀
        </Button>
      </DialogContent>
    </Dialog>
  )
}
