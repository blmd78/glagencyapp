'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { bigConfetti } from '@/lib/confetti'
import { playCreak, playThud, playTroll, playVictory, playWind } from '@/lib/sfx'
import { eur } from '@/lib/format'
import type { SpinResult } from '../types'

/** Nombre de clics pour ouvrir le coffre — valeur GLA (`cineChest`, « Clique 10× »). */
const CLICKS_NEEDED = 10

/**
 * Révélation du résultat, une fois la roue arrêtée — en overlay, pas sous le bouton : ce moment
 * mérite tout l'écran. Reprise de la cinématique `cineChest` de l'app Good Luck Agency, ramenée
 * au design system : `Dialog`, `Progress` et les animations de `tw-animate-css` au lieu de
 * l'overlay maison et de son système de particules de fumée en canvas.
 *
 * Gagné → un coffre qu'il faut marteler 10 fois pour l'ouvrir. Ce n'est pas de la friction
 * gratuite : l'effort transforme un résultat déjà décidé en quelque chose qu'on arrache. Les
 * confettis et le jingle tombent à l'ouverture, pas avant.
 *
 * Raté → la carte tout de suite, sans cérémonie.
 *
 * AUCUN tirage ici : `result` vient du serveur et le gain y est déjà enregistré. Fermer la modale
 * avant d'avoir fini les 10 clics ne fait donc rien perdre — c'est la porte de sortie pour qui n'a
 * pas envie de jouer le jeu.
 */
export function WheelResult({
  result,
  winnerName,
  onDone,
}: {
  result: SpinResult
  /** Le chatteur pour qui le tour a été lancé — l'encadrant ne joue pas pour lui-même. */
  winnerName: string | null
  onDone: () => void
}) {
  const [clicks, setClicks] = useState(0)
  const opened = clicks >= CLICKS_NEEDED

  // À l'ouverture de la modale : le vent annonce le coffre, le « troll » sanctionne le raté.
  useEffect(() => {
    if (result.won) playWind()
    else playTroll()
  }, [result.won])

  useEffect(() => {
    if (!opened) return
    // Le couvercle cède, PUIS la fanfare : les deux en même temps se mangent.
    playCreak()
    bigConfetti()
    const t = window.setTimeout(playVictory, 700)
    return () => window.clearTimeout(t)
  }, [opened])

  return (
    <Dialog open onOpenChange={(next) => !next && onDone()}>
      <DialogContent className="sm:max-w-[420px]">
        {!result.won ? (
          <>
            <DialogHeader className="items-center text-center">
              <span aria-hidden className="text-5xl leading-none">😅</span>
              <DialogTitle className="mt-3">Raté !</DialogTitle>
              <DialogDescription>
                {winnerName ? `Pas de lot pour ${winnerName} cette fois.` : 'Pas de lot cette fois.'}
              </DialogDescription>
            </DialogHeader>
            <Button type="button" variant="outline" className="w-full" onClick={onDone}>
              OK
            </Button>
          </>
        ) : !opened ? (
          <>
            <DialogHeader className="items-center text-center">
              <DialogTitle>{winnerName ? `${winnerName} a gagné quelque chose 👀` : 'Gagné 👀'}</DialogTitle>
              <DialogDescription>
                Clique {CLICKS_NEEDED}× sur le coffre pour l’ouvrir — {CLICKS_NEEDED - clicks} restant
                {CLICKS_NEEDED - clicks > 1 ? 's' : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="relative mx-auto">
              {/* Le halo remplace la fumée en canvas de l'original : même rôle — faire ÉMERGER le
                  coffre au lieu de l'afficher — en Tailwind pur (flou + pulsation), sans particules. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-pulse rounded-full bg-gold/30 blur-3xl"
              />
              <button
                type="button"
                  onClick={() => {
                  playThud()
                  setClicks((n) => n + 1)
                }}
                aria-label={`Frapper le coffre (${clicks} sur ${CLICKS_NEEDED})`}
                className="relative rounded-full p-6 transition-transform hover:scale-105 active:scale-95"
              >
                {/* Deux animations superposées : l'émergence (une fois, lente) porte le conteneur,
                    `key={clicks}` rejoue le tressautement à CHAQUE coup. */}
                <span aria-hidden className="block animate-in fade-in zoom-in-50 duration-1000">
                  <span key={clicks} className="block animate-in zoom-in-95 text-7xl leading-none duration-150">
                    🎁
                  </span>
                </span>
              </button>
            </div>
            <Progress
              value={(clicks / CLICKS_NEEDED) * 100}
              indicatorClassName="bg-gold"
              label="Ouverture du coffre"
            />
          </>
        ) : (
          <div className="relative flex animate-in flex-col items-center gap-2 text-center duration-500 fade-in zoom-in-95">
            {/* Faisceau de lumière derrière le lot — l'équivalent du `light-beam` de l'original. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-4 left-1/2 size-40 -translate-x-1/2 rounded-full bg-gold/30 blur-3xl"
            />
            <DialogHeader className="items-center text-center">
              <span aria-hidden className="relative text-6xl leading-none">🎉</span>
              <DialogTitle className="mt-3">{winnerName ? `${winnerName} gagne` : 'Gagné'}</DialogTitle>
              <DialogDescription className="text-lg font-semibold text-foreground">
                {result.prize?.label ?? result.sectorLabel}
              </DialogDescription>
            </DialogHeader>
            {result.prize?.amountEur != null && (
              <p className="text-3xl font-semibold tabular-nums">{eur(result.prize.amountEur)}</p>
            )}
            <p className="text-sm text-muted-foreground">
              Le gain est enregistré — l’agence le versera / l’appliquera.
            </p>
            <Button type="button" className="mt-2 w-full" onClick={onDone}>
              Revenir à la roue
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
