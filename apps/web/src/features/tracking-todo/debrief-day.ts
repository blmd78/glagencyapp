import { addDays } from '@glagency/core'
import type { TodoDay } from './types'

/**
 * Le jour du « Bilan du jour » — règles PURES, partagées entre le service (jour proposé au rendu)
 * et la carte (listes du jour choisi). Depuis 2026-09-03, l'encadrant CHOISIT ce jour : celui qui
 * finit son service après minuit débriefe la journée qu'il vient de faire, pas celle qui commence.
 * Aucune coupure horaire imposée — décision Benoit, « laisse-les mettre comme ils veulent ».
 */

/**
 * Jour proposé par défaut : aujourd'hui s'il tombe dans la semaine affichée ; sinon le dimanche
 * d'une semaine passée (la dernière journée à débriefer) ou le lundi d'une semaine à venir.
 */
export function defaultDebriefDay(today: string, weekStart: string): string {
  const weekEnd = addDays(weekStart, 6)
  if (today < weekStart) return weekStart
  if (today > weekEnd) return weekEnd
  return today
}

/** Libellés des tâches faites / pas faites d'un jour de la semaine, dans l'ordre de la grille. */
export function debriefLists(days: TodoDay[], day: string): { done: string[]; pending: string[] } {
  const tasks = days.find((d) => d.date === day)?.sections.flatMap((s) => s.tasks) ?? []
  return {
    done: tasks.filter((t) => t.done).map((t) => t.label),
    pending: tasks.filter((t) => !t.done).map((t) => t.label),
  }
}
