import type { BuiltSegments, TrackerEvent } from './types'

/**
 * Détection d'écran figé.
 *
 * Le compteur d'inactivité dit si quelqu'un est devant le PC ; la liste blanche dit sur quoi. Aucun
 * des deux ne voit un simulateur de souris laissé sur un onglet autorisé : le poste paraît actif,
 * sur un site légitime, pendant des heures.
 *
 * Le signal qui reste, et qu'on collecte déjà : le CHANGEMENT de fenêtre. Un chatter qui travaille
 * bascule sans arrêt. Une longue plage active sans le moindre changement est anormale.
 *
 * On ne conclut JAMAIS d'une absence de donnée : si le suivi des fenêtres n'a rien remonté (vieille
 * version de l'app, capture impossible), on ne signale rien.
 */

export interface StagnantStretch {
  minutes: number
  from: number | null
  to: number | null
  /** `false` = on n'a pas assez de données de fenêtre pour se prononcer. */
  tracked: boolean
}

export function stagnantStretch(
  built: BuiltSegments,
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
): StagnantStretch {
  const active = built.segments
    .filter((s) => s.kind === 'active')
    .map((s): [number, number] => [Math.max(s.start, windowStart), Math.min(s.end, windowEnd)])
    .filter(([s, e]) => e > s)
  if (!active.length) return { minutes: 0, from: null, to: null, tracked: false }

  // Instants où la fenêtre au premier plan a changé.
  const changes = events
    .filter((e) => e.type === 'focus')
    .map((e) => Date.parse(e.at))
    .filter((t) => Number.isFinite(t) && t >= windowStart && t <= windowEnd)
    .sort((a, b) => a - b)

  // Moins de 2 changements : soit l'app ne suit pas les fenêtres, soit elles sont illisibles.
  // Dans le doute, on ne signale pas.
  if (changes.length < 2) return { minutes: 0, from: null, to: null, tracked: false }

  let best: StagnantStretch = { minutes: 0, from: null, to: null, tracked: true }
  for (const [s, e] of active) {
    // Bornes des trous : début du segment, chaque changement dedans, fin du segment.
    const marks = [s, ...changes.filter((t) => t > s && t < e), e]
    for (let i = 1; i < marks.length; i++) {
      const to = marks[i] as number
      const from = marks[i - 1] as number
      const minutes = Math.round((to - from) / 60_000)
      if (minutes > best.minutes) best = { minutes, from, to, tracked: true }
    }
  }
  return best
}
