import type { Urgency } from './urgency'

/**
 * L'ORDRE DES TÂCHES DANS UNE SECTION (#161) — règle pure, partagée par la grille (`get-week.ts`)
 * et par les actions qui posent une tâche à un rang (`addTask`, `moveTask`, `updateTask`).
 *
 * Une clé entière par tâche : `tracker_todo_tasks.position` (0127). Elle n'était écrite que par
 * l'import du tracker ; toutes les autres lignes valent 0, et l'écran suivait l'ordre de Postgres
 * entre égalités. Les égalités se départagent désormais par la date de création — l'ordre que
 * l'écran montrait en pratique, donc rien ne bouge tant qu'on ne touche à rien.
 *
 * LES HABITUDES EN HAUT par défaut (décision de Benoit, 2026-10-12) : une occurrence virtuelle
 * prend la clé `habitKey(position)`, très négative, dans l'ordre des habitudes — leur `position`,
 * unique et stable depuis 0193. `materialize()` pose cette même clé sur la ligne qu'elle crée :
 * cocher une habitude ne la fait pas sauter de place.
 *
 * Les clés sont ESPACÉES (`STEP`) : poser une tâche entre deux autres prend le milieu, sans
 * réécrire la section. Il ne faut renuméroter que lorsque deux clés se touchent (les lignes d'avant
 * #161, toutes à 0) — et seulement les VRAIES lignes : une occurrence virtuelle n'a pas de ligne
 * où écrire, sa clé est fixe et les autres se rangent autour.
 */
export const STEP = 1024
const HABIT_BASE = -1024 * 1024

/** Clé d'une occurrence d'habitude : la `position` de son habitude (unique par titulaire, 0193). */
export const habitKey = (position: number): number => HABIT_BASE + position * STEP

export interface Slot {
  id: string
  key: number
  /** Départage deux clés égales : la date de création ('' pour une occurrence virtuelle). */
  tie: string
  /** Occurrence virtuelle d'habitude : aucune ligne en base, sa clé ne peut pas bouger. */
  fixed: boolean
  urgency: Urgency
}

export function sortSlots<T extends Pick<Slot, 'key' | 'tie'>>(slots: readonly T[]): T[] {
  return [...slots].sort((a, b) => a.key - b.key || (a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0))
}

/**
 * Où ARRIVE une tâche selon son urgence (décision de Benoit, 2026-10-12) : une urgente en haut, une
 * importante sous les urgentes, une normale en bas. Seulement à l'arrivée — création, changement
 * d'urgence ou de jour — : ce qu'on a glissé à la main reste où on l'a mis.
 */
export function arrivalIndex(sorted: readonly Pick<Slot, 'urgency'>[], urgency: Urgency): number {
  if (urgency === 'urgente') return 0
  if (urgency === 'normale') return sorted.length
  let lastUrgent = -1
  sorted.forEach((s, i) => {
    if (s.urgency === 'urgente') lastUrgent = i
  })
  return lastUrgent + 1
}

/**
 * La clé d'une tâche posée au rang `index` de `sorted` (la section SANS elle), et les vraies
 * lignes à renuméroter quand la place manque. Rend `null` dans le seul cas sans issue : plus de
 * tâches à ranger entre deux occurrences d'habitude que d'entiers libres (> 1000).
 */
export function placeAt(
  sorted: readonly Slot[],
  index: number,
): { key: number; moves: { id: string; key: number }[] } | null {
  const i = Math.max(0, Math.min(index, sorted.length))
  const lo = sorted[i - 1]
  const hi = sorted[i]
  if (!lo && !hi) return { key: 0, moves: [] }
  if (!lo) return { key: (hi as Slot).key - STEP, moves: [] }
  if (!hi) return { key: lo.key + STEP, moves: [] }
  if (hi.key - lo.key >= 2) return { key: Math.floor((lo.key + hi.key) / 2), moves: [] }

  // Plus de place : on renumérote la fenêtre de VRAIES lignes qui entoure le rang visé, entre les
  // deux occurrences virtuelles (clés fixes) qui la bornent — ou sans borne de ce côté-là.
  let a = i
  while (a > 0 && !(sorted[a - 1] as Slot).fixed) a--
  let b = i
  while (b < sorted.length && !(sorted[b] as Slot).fixed) b++
  const window = sorted.slice(a, b)
  const floor = a > 0 ? (sorted[a - 1] as Slot).key : null
  const ceil = b < sorted.length ? (sorted[b] as Slot).key : null
  const count = window.length + 1 // la fenêtre, plus la tâche posée

  let keys: number[]
  if (floor === null && ceil === null) keys = Array.from({ length: count }, (_, j) => j * STEP)
  else if (floor === null) keys = Array.from({ length: count }, (_, j) => (ceil as number) - (count - j) * STEP)
  else if (ceil === null) {
    // Sous la dernière habitude : on repart des clés positives, celles des tâches ordinaires — sinon
    // les lignes renumérotées prendraient des clés d'habitude, et une habitude créée plus tard
    // viendrait s'intercaler entre elles au lieu de rejoindre les autres en haut.
    const base = Math.max(floor + STEP, 0)
    keys = Array.from({ length: count }, (_, j) => base + j * STEP)
  }
  else {
    const step = Math.floor((ceil - floor) / (count + 1))
    if (step < 1) return null
    keys = Array.from({ length: count }, (_, j) => floor + (j + 1) * step)
  }

  // La tâche posée occupe le rang `i - a` dans la fenêtre ; les autres gardent leur ordre.
  const at = i - a
  const moves: { id: string; key: number }[] = []
  window.forEach((s, j) => {
    const key = keys[j < at ? j : j + 1] as number
    if (key !== s.key) moves.push({ id: s.id, key })
  })
  return { key: keys[at] as number, moves }
}
