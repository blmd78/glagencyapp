/**
 * Confettis — portage TypeScript du canvas maison de l'app Good Luck
 * Agency d'origine (`index.html`, `confettiBurst` / `celebrateSound`). Aucune dépendance ajoutée :
 * un canvas jetable en `position:fixed`, retiré dès la dernière particule éteinte.
 *
 * Utilitaires DOM purs (pas des composants) — la norme feature range ce genre de code hors du
 * composant qui l'appelle (précédent : `download-ranking.ts` du pilote Chatteurs).
 *
 * VISUEL uniquement : les sons vivent dans `lib/sfx.ts` (un seul contexte audio, un seul
 * interrupteur de mute). Les appelants qui veulent les deux importent les deux.
 *
 * Ces fonctions ne s'appellent QUE depuis un effet client, jamais au rendu.
 */

const COLORS = ['#13C57A', '#19d3a2', '#54f0b4', '#ffb547', '#ff5d7c', '#6bb6ff', '#ffffff']

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string }

/** a11y : ni confettis ni animation pour qui a demandé moins de mouvement (même règle que `globals.css`). */
const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Pluie de confettis. `bursts` = nombre de salves (une toutes les 230 ms, 44 particules chacune),
 * `maxFrames` = durée avant de couper le robinet — les particules déjà en l'air finissent leur chute.
 */
export function burstConfetti(bursts = 7, maxFrames = 190): void {
  if (typeof document === 'undefined' || reducedMotion()) return

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none'
  canvas.setAttribute('aria-hidden', 'true')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = (canvas.width = window.innerWidth)
  const h = (canvas.height = window.innerHeight)
  document.body.appendChild(canvas)

  const parts: Particle[] = []
  const burst = (x: number, y: number) => {
    for (let i = 0; i < 44; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 2 + Math.random() * 5.5
      parts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: COLORS[i % COLORS.length] ?? '#ffffff',
      })
    }
  }

  let fired = 0
  const timer = window.setInterval(() => {
    if (fired >= bursts) return
    burst(w * (0.12 + Math.random() * 0.76), h * (0.12 + Math.random() * 0.5))
    fired++
  }, 230)

  let frames = 0
  const loop = () => {
    frames++
    ctx.clearRect(0, 0, w, h)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (!p) continue
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.06 // gravité
      p.life -= 0.011
      ctx.globalAlpha = Math.max(p.life, 0)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
      if (p.life <= 0) parts.splice(i, 1)
    }
    if (frames < maxFrames || parts.length > 0) {
      requestAnimationFrame(loop)
      return
    }
    window.clearInterval(timer)
    canvas.remove()
  }
  requestAnimationFrame(loop)
}

/** Trois salves espacées — réservé aux gros moments (montée de rang, formation terminée). */
export function bigConfetti(): void {
  burstConfetti(7, 190)
  window.setTimeout(() => burstConfetti(7, 190), 350)
  window.setTimeout(() => burstConfetti(7, 190), 700)
}
