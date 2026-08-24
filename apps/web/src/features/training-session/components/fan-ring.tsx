import { cn } from '@/lib/utils'

/** Sous ce seuil (secondes), l'anneau passe au rouge et pulse. */
const URGENT_S = 10

/**
 * L'avatar du fan cerclé de son chrono — transposition du `.tring` de Good Luck Agency : un
 * `conic-gradient` qui se vide au fil du temps restant.
 *
 * C'est bien plus lisible qu'un compteur en chiffres : pendant qu'on écrit, on voit l'anneau se
 * vider du coin de l'œil sans quitter son texte. Sous 10 s il vire au rouge et pulse — ce qui met
 * la pression que l'exercice cherche à créer.
 *
 * `seconds` à `null` = pas de chrono sur ce cas (solo sans limite) : l'anneau reste plein et neutre.
 */
export function FanRing({
  name,
  seconds,
  maxSeconds,
  size = 40,
}: {
  name: string
  seconds: number | null
  /** Durée totale du chrono, pour la part restante. */
  maxSeconds: number | null
  size?: number
}) {
  const timed = seconds != null && maxSeconds != null && maxSeconds > 0
  const pct = timed ? Math.max(0, Math.min(100, (seconds / maxSeconds) * 100)) : 100
  const urgent = timed && seconds <= URGENT_S
  const initial = name.trim().charAt(0).toUpperCase() || '🙂'

  return (
    <span
      className={cn('gla-tring', urgent && 'gla-tring-urg')}
      style={
        {
          width: size,
          height: size,
          '--p': pct,
          '--ring-col': urgent ? 'var(--gla-danger)' : 'var(--gla-accent)',
        } as React.CSSProperties
      }
      aria-hidden
    >
      <span style={{ fontSize: size * 0.375 }}>{initial}</span>
    </span>
  )
}
