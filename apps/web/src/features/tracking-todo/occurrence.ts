import { isoWeekday } from '@glagency/core'

/**
 * Une habitude est-elle due CE jour-là ? Active, jour de la semaine coché, et pas avant sa date de
 * début (0193 — posée par l'import #163 : une routine créée aujourd'hui ne remonte pas dans les
 * semaines passées). Nulle = sans borne, comme toutes les habitudes d'avant 0193. Le Récap applique
 * la même borne en SQL.
 */
export function isDue(
  habit: { active: boolean; weekdays: string; starts_on: string | null },
  date: string,
): boolean {
  return (
    habit.active &&
    habit.weekdays.split(',').map(Number).includes(isoWeekday(date)) &&
    (habit.starts_on === null || date >= habit.starts_on)
  )
}

/**
 * Les habitudes dont l'occurrence est DUE, et encore virtuelle, dans une section un jour donné —
 * avec leur RANG dans la liste complète des habitudes du titulaire, qui fixe leur place en haut de
 * la section (`habitKey`, `order.ts`). La liste complète et non les seules actives : mettre une
 * habitude en pause ne doit pas faire bouger les autres.
 *
 * Partagée par la grille (`get-week.ts`) et par les actions qui posent une tâche à un rang : les
 * deux doivent voir la même section, sinon le rang calculé par le serveur ne serait pas celui
 * qu'on a visé à l'écran.
 */
export function dueHabits<
  H extends { id: string; label: string; category: string; weekdays: string; active: boolean; starts_on: string | null },
>(
  habits: readonly H[],
  date: string,
  category: string,
  dayTasks: readonly { habitId: string | null; label: string; category: string }[],
): { habit: H; rank: number }[] {
  return habits
    .map((habit, rank) => ({ habit, rank }))
    .filter(({ habit: h }) => h.category === category && isDue(h, date))
    .filter(({ habit: h }) => !isMaterialized(h, dayTasks))
}

/**
 * L'occurrence du jour d'une habitude est-elle DÉJÀ une vraie ligne ? Si oui, la grille ne rend pas
 * l'occurrence virtuelle — sinon la même tâche apparaît deux fois.
 *
 * DEPUIS 0192, on la reconnaît à son `habitId` (posé par `materialize()`), n'importe où dans la
 * journée : une occurrence RENOMMÉE dans la pop-up (#160) reste la sienne. Avant, seul l'intitulé
 * la reconnaissait, et un titre changé faisait renaître l'habitude à côté de la tâche renommée.
 *
 * REPLI sur l'intitulé, dans la même section, pour les lignes d'avant 0192 (`habitId` nul) — la
 * règle d'origine, inchangée. Le Récap reconnaît l'occurrence à son `habit_id` lui aussi (0192,
 * bloc `planned`) ; son repli par intitulé, lui, a toujours porté sur la journée entière.
 */
export function isMaterialized(
  habit: { id: string; label: string; category: string },
  dayTasks: readonly { habitId: string | null; label: string; category: string }[],
): boolean {
  return dayTasks.some(
    (t) =>
      t.habitId === habit.id ||
      (t.habitId === null && t.category === habit.category && t.label === habit.label),
  )
}
