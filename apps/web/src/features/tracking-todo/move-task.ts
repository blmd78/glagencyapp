import type { TodoDay } from './types'

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
export function moveTaskInDays(days: TodoDay[], taskId: string, date: string, category: string): TodoDay[] {
  const task = days.flatMap((d) => d.sections.flatMap((s) => s.tasks)).find((t) => t.id === taskId)
  if (!task) return days

  return days.map((d) => {
    const sections = d.sections.flatMap((s) => {
      if (!s.tasks.some((t) => t.id === taskId)) return [s]
      const tasks = s.tasks.filter((t) => t.id !== taskId)
      return tasks.length > 0 || s.recurring ? [{ ...s, tasks }] : []
    })
    if (d.date !== date) return { ...d, sections }
    return {
      ...d,
      sections: sections.some((s) => s.name === category)
        ? sections.map((s) => (s.name === category ? { ...s, tasks: [...s.tasks, task] } : s))
        : [...sections, { name: category, recurring: false, tasks: [task] }],
    }
  })
}
