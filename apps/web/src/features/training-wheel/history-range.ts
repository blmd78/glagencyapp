import { mondayOf } from '@glagency/core'

/**
 * Les semaines de tirages à afficher pour la période du header (`?from=&to=`) : toutes celles qui
 * la touchent, du lundi de la date de début jusqu'à la date de fin. Une semaine se lit par son
 * lundi (`training_wheel_spins.week`).
 */
export function historyWeekBounds(period: { from: string; to: string }): { fromWeek: string; toWeek: string } {
  return { fromWeek: mondayOf(period.from), toWeek: period.to }
}
