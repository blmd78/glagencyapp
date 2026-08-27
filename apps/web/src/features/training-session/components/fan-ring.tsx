import { cn } from '@/lib/utils'

/** Sous ce seuil (secondes), l'anneau passe au rouge et pulse (GLA `index.html:1614`). */
const URGENT_S = 10
/** Palier intermédiaire : entre 10 et 20 s l'anneau vire à l'orange (GLA `index.html:1613`). */
const WARN_S = 20

/**
 * L'avatar du fan cerclé de son chrono — transposition du `.tring` de Good Luck Agency : un
 * `conic-gradient` qui se vide au fil du temps restant.
 *
 * C'est bien plus lisible qu'un compteur en chiffres : pendant qu'on écrit, on voit l'anneau se
 * vider du coin de l'œil sans quitter son texte. Sous 10 s il vire au rouge et pulse — ce qui met
 * la pression que l'exercice cherche à créer.
 *
 * `seconds` à `null` = aucun chrono ARMÉ à cet instant (fan en train d'écrire, conversation close) :
 * l'anneau reste plein et neutre, exactement comme le `ringIdle()` de GLA (`index.html:1602`). Ce
 * n'est PAS « le solo n'a pas de limite » — le solo a bien 60 s (`reactionSecondsFor`).
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
  // Trois paliers comme GLA : accent > 20 s, orange ≤ 20 s, rouge ≤ 10 s.
  // Au REPOS (aucun chrono armé), GLA rendait l'anneau GRIS et non vert plein — `.tring.idle`
  // (index.html:291), posé par `ringIdle()` (:1602). Un anneau vert plein se lit « il te reste tout
  // ton temps », ce qui est faux : il n'y a simplement pas de chrono en cours.
  const ringCol = !timed
    ? 'rgba(255,255,255,.13)'
    : seconds > WARN_S
      ? 'var(--gla-accent)'
      : urgent
        ? 'var(--gla-danger)'
        : 'var(--gla-warning)'
  const initial = name.trim().charAt(0).toUpperCase() || '🙂'

  return (
    <span
      className={cn('gla-tring', urgent && 'gla-tring-urg')}
      style={
        {
          width: size,
          height: size,
          '--p': pct,
          '--ring-col': ringCol,
        } as React.CSSProperties
      }
      aria-hidden
    >
      <span style={{ fontSize: size * 0.375 }}>{initial}</span>
    </span>
  )
}
