import { cn } from '@/lib/utils'

/**
 * Barre de progression — API shadcn (`<Progress value={48} />`), implémentée SANS Radix.
 *
 * Pourquoi pas `@radix-ui/react-progress` : la primitive Radix impose `'use client'`, or toutes
 * nos barres (Ma formation, modules, test de recrutement) sont rendues par des Server Components.
 * Une dépendance de plus pour transformer trois `<div>` en feuille client n'a pas de contrepartie.
 * Le contrat ARIA de la primitive est repris tel quel, les tokens aussi.
 *
 * `animated` : la barre se remplit de 0 jusqu'à `value` au chargement (`.xp-bar`, `globals.css`,
 * neutralisé par `prefers-reduced-motion`). Réservé aux barres « héros » — animer une liste
 * entière de modules donnerait une page qui gigote.
 */
export function Progress({
  value,
  className,
  indicatorClassName,
  animated = false,
  label,
}: {
  /** 0-100. Les valeurs hors bornes sont ramenées dans l'intervalle. */
  value: number
  className?: string
  /** Couleur/forme de la partie remplie (ex. `bg-xp`, `bg-green-600`). */
  indicatorClassName?: string
  animated?: boolean
  /** Libellé lu par les lecteurs d'écran — sans lui la barre n'annonce qu'un pourcentage nu. */
  label?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full bg-primary', animated && 'xp-bar', indicatorClassName)}
        // `--xp-pct` porte la largeur finale : correcte même sans animation (JS coupé, impression).
        style={animated ? ({ '--xp-pct': `${pct}%` } as React.CSSProperties) : { width: `${pct}%` }}
      />
    </div>
  )
}
