'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Stepper minimal maison — shadcn n'en fournit pas d'officiel (vérifié 2026-08-06), et sa
 * philosophie est justement de composer ce genre de pièce avec les primitives. Pastille
 * numérotée (coche quand l'étape est passée), libellé, connecteur fin entre les étapes —
 * FONCTIONNEL (il dit l'ordre), pas décoratif.
 *
 * Les pastilles sont cliquables si `onStepClick` est fourni : c'est le PARENT qui décide de la
 * règle de navigation (revenir librement, valider avant d'avancer…) — le stepper ne fait
 * qu'annoncer le clic.
 */
export function Stepper({
  steps,
  current,
  onStepClick,
}: {
  steps: { label: string }[]
  /** Étape active, 1-indexée (comme on la lit : « étape 1/2 »). */
  current: number
  onStepClick?: (step: number) => void
}) {
  return (
    <ol className="flex items-center gap-3">
      {steps.map((s, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          // Un connecteur APRÈS chaque étape sauf la dernière — la paire (étape, connecteur)
          // s'étire, la dernière étape reste à sa taille.
          <li key={s.label} className={cn('flex items-center gap-3', n < steps.length && 'flex-1')}>
            <button
              type="button"
              onClick={onStepClick ? () => onStepClick(n) : undefined}
              disabled={!onStepClick || active}
              className={cn(
                'flex items-center gap-2',
                onStepClick && !active && 'cursor-pointer',
              )}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                  active && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-primary text-primary',
                  !active && !done && 'border-border text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span
                className={cn(
                  'text-sm transition-colors',
                  active ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </button>
            {n < steps.length && <span aria-hidden className="h-px flex-1 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}
