'use client'

import { useEffect, useState } from 'react'
import { burstConfetti } from '@/lib/confetti'
import { eur } from '@/lib/format'
import type { RankedChatter } from '../types'
import {
  CROWN_PATH,
  GOLD_CONFETTI,
  LAUREL_LEAVES,
  LAUREL_STEMS,
  METAL,
  initials,
  type Place,
} from './podium-art'

/** Gauche → droite : 2e, 1er, 3e. */
const ORDER: Place[] = [2, 1, 3]
const STEP_HEIGHT: Record<Place, string> = { 1: 'h-36 sm:h-44', 2: 'h-28 sm:h-32', 3: 'h-20 sm:h-24' }
const AVATAR_SIZE: Record<Place, string> = { 1: 'size-20 sm:size-28', 2: 'size-16 sm:size-20', 3: 'size-16 sm:size-20' }
/** Le suspense : le 3e monte, puis le 2e, puis le 1er. */
const DELAY_MS: Record<Place, number> = { 3: 0, 2: 250, 1: 550 }

/**
 * Podium du classement : trois marches or / argent / bronze, couronne et lauriers, montants qui
 * défilent jusqu'à leur valeur, confettis dorés à l'arrivée.
 *
 * Les confettis tombent une fois par période et par session (`sessionStorage`), pas à chaque
 * visite : la fête doit rester un événement. Ni confettis ni défilement pour qui a demandé moins
 * de mouvement (`burstConfetti` et `useCountUp` le respectent tous les deux).
 */
export function StatPodium({ top, periodKey }: { top: RankedChatter[]; periodKey: string }) {
  useEffect(() => {
    const key = `statChatteurConfetti_${periodKey}`
    // Stockage refusé (navigation privée, stockage désactivé) : pas de fête, pas de crash — même
    // règle que `me-celebrate`.
    try {
      if (sessionStorage.getItem(key)) return
    } catch {
      return
    }
    // La clé se pose AU tir : un effet monté deux fois (StrictMode) ne doit pas l'avaler.
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(key, '1')
      } catch {
        return
      }
      burstConfetti(8, 200, GOLD_CONFETTI)
    }, DELAY_MS[1] + 500)
    return () => window.clearTimeout(t)
  }, [periodKey])

  return (
    <ol className="mx-auto flex w-full max-w-3xl items-end justify-center gap-2 sm:gap-4">
      {ORDER.map((place) => {
        const row = top[place - 1]
        // Marche vide (moins de 3 classés) : la colonne reste, le 1er ne se décentre pas.
        return row ? (
          <Step key={place} row={row} place={place} />
        ) : (
          <li key={place} className="min-w-0 flex-1" aria-hidden />
        )
      })}
    </ol>
  )
}

function Step({ row, place }: { row: RankedChatter; place: Place }) {
  const m = METAL[place]
  const amount = useCountUp(row.ca, DELAY_MS[place] + 350)
  const metalText = { backgroundImage: `linear-gradient(180deg, ${m.light}, ${m.mid} 55%, ${m.dark})` }

  return (
    <li
      className="flex min-w-0 flex-1 flex-col items-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-12 motion-safe:duration-700"
      style={{ animationDelay: `${DELAY_MS[place]}ms`, animationFillMode: 'both' }}
    >
      <div className={`relative mb-5 ${AVATAR_SIZE[place]}`}>
        {place === 1 && (
          <svg
            viewBox="0 0 36 26"
            aria-hidden
            className="absolute -top-9 left-1/2 w-12 -translate-x-1/2 sm:-top-12 sm:w-16"
            style={{ filter: `drop-shadow(0 0 12px ${m.glow})` }}
          >
            <defs>
              <linearGradient id="stat-crown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={m.light} />
                <stop offset="0.6" stopColor={m.mid} />
                <stop offset="1" stopColor={m.dark} />
              </linearGradient>
            </defs>
            <path d={CROWN_PATH} fill="url(#stat-crown)" />
          </svg>
        )}
        <Laurel color={m.mid} stem={m.dark} />
        <div
          className="relative grid size-full place-items-center rounded-full p-[3px]"
          style={{
            backgroundImage: `linear-gradient(160deg, ${m.light}, ${m.mid} 45%, ${m.dark})`,
            boxShadow: `0 0 36px ${m.glow}`,
          }}
        >
          <div className="grid size-full place-items-center rounded-full bg-[#141417]">
            <span
              className="bg-clip-text font-[family-name:var(--font-gla-head)] text-xl font-bold text-transparent sm:text-3xl"
              style={metalText}
            >
              {initials(row.name)}
            </span>
          </div>
        </div>
      </div>

      <p className="w-full truncate px-1 text-center text-sm font-semibold text-white sm:text-base" title={row.name}>
        {row.name}
      </p>
      <p
        className="mb-2 bg-clip-text font-[family-name:var(--font-gla-head)] text-base font-bold tabular-nums text-transparent sm:text-xl"
        style={metalText}
      >
        <span aria-hidden>{eur(amount)}</span>
        <span className="sr-only">{eur(row.ca)}</span>
      </p>

      <div
        className={`relative grid w-full place-items-center rounded-t-2xl bg-gradient-to-b from-[#2a2a31] via-[#141418] to-[#0b0b0e] ${STEP_HEIGHT[place]}`}
        style={{ boxShadow: `0 -18px 50px -20px ${m.glow}, inset 0 3px 0 ${m.mid}` }}
      >
        <span
          // `px-3` : le fond découpé ne peint que la boîte du texte — sans marge, le haut penché du
          // chiffre italique déborde et disparaît.
          className="bg-clip-text px-3 font-[family-name:var(--font-gla-head)] text-5xl font-bold italic leading-none text-transparent sm:text-7xl"
          style={metalText}
        >
          {place}
        </span>
        <span className="sr-only">{place === 1 ? '1re' : `${place}e`} place</span>
      </div>
    </li>
  )
}

/** Couronne de laurier autour de l'avatar — mêmes feuilles que l'image exportée (`podium-art`). */
function Laurel({ color, stem }: { color: string; stem: string }) {
  const { from, to, r } = LAUREL_STEMS
  const pt = (deg: number, mirror: boolean) => {
    const t = (deg * Math.PI) / 180
    const x = 50 + r * Math.cos(t)
    return `${mirror ? 100 - x : x} ${50 + r * Math.sin(t)}`
  }
  return (
    // Repère 100×100 où l'avatar a un rayon de 30 → la boîte déborde d'un tiers de chaque côté.
    <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute -inset-[33.333%] overflow-visible">
      <path d={`M${pt(from, false)} A${r} ${r} 0 0 1 ${pt(to, false)}`} stroke={stem} strokeWidth="1.2" fill="none" />
      <path d={`M${pt(from, true)} A${r} ${r} 0 0 0 ${pt(to, true)}`} stroke={stem} strokeWidth="1.2" fill="none" />
      {LAUREL_LEAVES.map((l, i) => (
        <ellipse key={i} cx={l.x} cy={l.y} rx="7" ry="3" fill={color} transform={`rotate(${l.rot} ${l.x} ${l.y})`} />
      ))}
    </svg>
  )
}

/**
 * Montant qui défile de 0 à `target` (ease-out cubique, 1,4 s) après `delayMs`. Moins de mouvement
 * demandé → durée nulle : le premier frame pose directement la valeur finale.
 */
function useCountUp(target: number, delayMs: number): number {
  const [value, setValue] = useState(0)
  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = still ? 0 : 1400
    const start = performance.now() + (still ? 0 : delayMs)
    let raf = 0
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(Math.max((now - start) / duration, 0), 1)
      setValue(target * (1 - (1 - t) ** 3))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, delayMs])
  return value
}
