import type { TodoDay, TodoTask } from './types'

/**
 * La semaine telle que l'écran la montre dès qu'on LÂCHE une tâche, avant la réponse de `moveTask`.
 *
 * Sans elle, la carte qui suivait le curseur disparaît et la tâche reste sur son jour d'origine le
 * temps de l'aller-retour serveur, avant de sauter : on croit le geste raté. La revalidation remplace
 * ensuite cet état par la vérité serveur (ordre des groupes, position dans le groupe).
 *
 * Même reconstruction que `getTodoWeek` : un groupe non récurrent n'existe que par ses tâches — il
 * disparaît quand on vide le dernier, il naît quand on y pose le premier ; une section récurrente,
 * elle, reste affichée ce jour-là même vide.
 */
export function moveTaskInDays(
  days: TodoDay[],
  taskId: string,
  date: string,
  category: string,
  /** #161 — posée au-dessus de cette tâche ; en bas de la section si `null` ou introuvable. */
  beforeId: string | null = null,
): TodoDay[] {
  const task = days.flatMap((d) => d.sections.flatMap((s) => s.tasks)).find((t) => t.id === taskId)
  if (!task) return days

  /** Insère au-dessus de `beforeId`, comme le fera `placeTask` côté serveur. */
  const insert = (tasks: TodoTask[]): TodoTask[] => {
    const at = beforeId ? tasks.findIndex((t) => t.id === beforeId) : -1
    return at < 0 ? [...tasks, task] : [...tasks.slice(0, at), task, ...tasks.slice(at)]
  }

  return days.map((d) => {
    const sections = d.sections.flatMap((s) => {
      if (!s.tasks.some((t) => t.id === taskId)) return [s]
      const tasks = s.tasks.filter((t) => t.id !== taskId)
      // Le groupe qu'on réordonne ne disparaît pas le temps du geste, même s'il ne contenait
      // qu'elle : la tâche y revient juste en dessous.
      return tasks.length > 0 || s.recurring || (d.date === date && s.name === category) ? [{ ...s, tasks }] : []
    })
    if (d.date !== date) return { ...d, sections }
    return {
      ...d,
      sections: sections.some((s) => s.name === category)
        ? sections.map((s) => (s.name === category ? { ...s, tasks: insert(s.tasks) } : s))
        : [...sections, { name: category, recurring: false, tasks: [task] }],
    }
  })
}

/** Où une tâche a été lâchée (#161) : sur une autre tâche (au-dessus ou en dessous), une section, une journée. */
export type DropZone =
  | { kind: 'task'; date: string; category: string; taskId: string; after: boolean }
  | { kind: 'section'; date: string; category: string }
  | { kind: 'day'; date: string }

/**
 * Le geste que vaut un lâcher : jour, section et tâche au-dessus de laquelle se poser (`beforeId`,
 * `null` = en bas) — ou `null` s'il ne change RIEN (lâchée sur elle-même, ou à sa propre place), pour
 * ne pas faire un aller-retour serveur pour rien.
 *
 * Lâchée sur une journée et non sur une section, la tâche garde sa rubrique (comportement d'origine) ;
 * lâchée sur une section, elle y va en bas ; lâchée sur une tâche, au-dessus d'elle si le centre de
 * la carte attrapée est dans sa moitié haute, en dessous sinon.
 */
export function resolveDrop(
  days: TodoDay[],
  activeId: string,
  source: { date: string; category: string },
  zone: DropZone,
): { date: string; category: string; beforeId: string | null } | null {
  if (zone.kind === 'task' && zone.taskId === activeId) return null
  const date = zone.date
  const category = zone.kind === 'day' ? source.category : zone.category
  const list =
    days.find((d) => d.date === date)?.sections.find((s) => s.name === category)?.tasks.map((t) => t.id) ?? []

  let beforeId: string | null = null
  if (zone.kind === 'task') {
    const others = list.filter((id) => id !== activeId)
    const at = others.indexOf(zone.taskId)
    beforeId = zone.after ? (others[at + 1] ?? null) : zone.taskId
  }

  if (date === source.date && category === source.category) {
    const at = list.indexOf(activeId)
    const nextNow = at >= 0 ? (list[at + 1] ?? null) : null
    if (beforeId === nextNow) return null
  }
  return { date, category, beforeId }
}
