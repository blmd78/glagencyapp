'use client'

import { useEffect, useRef } from 'react'

/** Les six verts de l'aurore (GLA `cols`), en RGB pour composer l'alpha au vol. */
const COLORS = ['19,197,122', '45,235,165', '16,150,95', '25,211,162', '14,110,86', '60,245,180']

type Blob = { bx: number; by: number; ax: number; ay: number; sp: number; ph: number; r: number; c: string; al: number }

/**
 * Le fond animé de l'app Good Luck Agency — « aurore verte fluide » : six halos qui dérivent lentement
 * en fondu additif, et que la souris décale d'un souffle.
 *
 * C'est ce qui fait qu'un écran de formation ne ressemble pas à un tableur : il bouge, tout le
 * temps, sans jamais attirer l'œil. Un dégradé statique ne rend pas cet effet — d'où le canvas.
 *
 * Le POSITIONNEMENT vient du thème (`.gla > canvas`, `formation-theme.css`) et non d'ici : le
 * canvas doit se peindre AU-DESSUS du fond opaque de `.gla` et SOUS le contenu. En `fixed` avec un
 * z-index négatif, il passait derrière le fond du layout CRM — on ne voyait plus aucun fond.
 * La boucle est arrêtée au démontage (navigation vers une autre face).
 *
 * `prefers-reduced-motion` : on peint UNE image fixe et on s'arrête là — le fond garde son grain
 * sans mouvement, plutôt que de disparaître.
 */
export function AuroraBg() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return

    let w = 0
    let h = 0
    const resize = () => {
      // Plafonné à 2 : au-delà, on peint 4× plus de pixels pour un flou que personne ne voit.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      // Dimensions du CONTENEUR (le canvas est `absolute inset-0` dedans), pas de la fenêtre :
      // sur une page longue, l'aurore doit couvrir toute la hauteur, pas seulement le premier écran.
      const r = cv.getBoundingClientRect()
      w = cv.width = Math.max(1, r.width * dpr)
      h = cv.height = Math.max(1, r.height * dpr)
    }
    resize()
    // `ResizeObserver` et pas `window.resize` : le conteneur grandit quand le contenu arrive
    // (streaming des panneaux), sans que la fenêtre bouge — l'aurore doit suivre.
    const ro = new ResizeObserver(resize)
    ro.observe(cv)

    const mouse = { x: 0.5, y: 0.5, active: false }
    const onMove = (e: MouseEvent) => {
      // Position RELATIVE au canvas (il ne couvre plus la fenêtre entière depuis qu'il est borné
      // au conteneur) : sinon le décalage de l'aurore ne suit plus le curseur.
      const r = cv.getBoundingClientRect()
      mouse.x = (e.clientX - r.left) / Math.max(1, r.width)
      mouse.y = (e.clientY - r.top) / Math.max(1, r.height)
      mouse.active = true
    }
    const onOut = () => {
      mouse.active = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseout', onOut)

    const blobs: Blob[] = Array.from({ length: 6 }, (_, i) => ({
      bx: Math.random(),
      by: Math.random(),
      ax: 0.1 + Math.random() * 0.14,
      ay: 0.1 + Math.random() * 0.14,
      sp: 0.18 + Math.random() * 0.5,
      ph: Math.random() * 6.28,
      r: 0.4 + Math.random() * 0.28,
      c: COLORS[i % COLORS.length] ?? COLORS[0]!,
      al: 0.09 + Math.random() * 0.06,
    }))

    let t = 0
    let mxs = 0
    let mys = 0
    let raf = 0
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const paint = () => {
      t += 0.005
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#0e1016'
      ctx.fillRect(0, 0, w, h)
      // La souris décale toute l'aurore, avec une inertie (5 % par image) qui rend le geste doux.
      const tx = (mouse.active ? mouse.x - 0.5 : 0) * 0.07
      const ty = (mouse.active ? mouse.y - 0.5 : 0) * 0.07
      mxs += (tx - mxs) * 0.05
      mys += (ty - mys) * 0.05
      // `lighter` : les halos s'ADDITIONNENT là où ils se croisent — c'est ce qui fait l'aurore.
      ctx.globalCompositeOperation = 'lighter'
      for (const b of blobs) {
        const x = (b.bx + Math.sin(t * b.sp + b.ph) * b.ax + mxs) * w
        const y = (b.by + Math.cos(t * b.sp * 0.9 + b.ph) * b.ay + mys) * h
        const r = b.r * Math.max(w, h)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(${b.c},${b.al})`)
        g.addColorStop(1, `rgba(${b.c},0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      }
      ctx.globalCompositeOperation = 'source-over'
      if (!still) raf = requestAnimationFrame(paint)
    }
    paint()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseout', onOut)
    }
  }, [])

  return <canvas ref={ref} aria-hidden />
}
