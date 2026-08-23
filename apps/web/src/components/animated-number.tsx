'use client'

import { useEffect, useState } from 'react'

/**
 * Un nombre qui monte de 0 jusqu'à sa valeur — portage de `animateCount` de l'app Good Luck Agency
 * (900 ms, easing `p(2-p)`). C'est ce qui fait qu'une note ressemble à un résultat qu'on découvre
 * plutôt qu'à une donnée qui s'affiche.
 *
 * Le rendu serveur produit déjà la valeur FINALE : sans JS, sans animation ou pour un lecteur
 * d'écran, le nombre est juste. L'animation ne fait que rejouer le trajet au montage.
 */
export function AnimatedNumber({
  value,
  duration = 900,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let start = 0
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min(1, (ts - start) / duration)
      setDisplay(Math.round(value * (p * (2 - p))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return (
    <span className={className} suppressHydrationWarning>
      {display.toLocaleString('fr-FR')}
    </span>
  )
}
