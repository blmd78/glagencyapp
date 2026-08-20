import { cn } from '@/lib/utils'

/** Les 5 étapes du parcours, dans l'ordre — source unique du libellé et de la numérotation. */
export const STEP_LABELS = [
  'Test de logique',
  'Vitesse de frappe',
  'Connexion internet',
  'Conversation avec un client',
  'Tes coordonnées',
] as const

/**
 * Repère de progression : « Étape x/5 » + 5 segments. Volontairement muet sur la performance
 * (aucun score, aucun seuil) — le candidat sait où il en est, pas comment il s'en sort.
 */
export function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Étape {current}/{STEP_LABELS.length} · {STEP_LABELS[current - 1]}
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {STEP_LABELS.map((label, i) => (
          <span key={label} className={cn('h-1 flex-1 rounded-full', i < current ? 'bg-primary' : 'bg-muted')} />
        ))}
      </div>
    </div>
  )
}
