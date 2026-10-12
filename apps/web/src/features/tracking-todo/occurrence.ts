import { isoWeekday } from '@glagency/core'

/**
 * Une habitude est-elle due CE jour-là ? Active, jour de la semaine coché, et pas avant sa date de
 * début (0194 — posée par l'import #163 : une routine créée aujourd'hui ne remonte pas dans les
 * semaines passées). Nulle = sans borne, comme toutes les habitudes d'avant 0194. Le Récap applique
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

/** Ce qu'il faut d'une tâche pour dire de quelle occurrence d'habitude elle est la ligne. */
export interface OccurrenceRow {
  habitId: string | null
  /** Le jour dont elle est l'occurrence (0193) — gardé si la ligne change de jour. */
  habitDate: string | null
  /** Le jour où elle se trouve. */
  date: string
  label: string
  category: string
}

/**
 * Une section RÉCURRENTE revient-elle ce jour-là ? Jour de la semaine coché, et pas avant sa date de
 * début (0194 — posée par l'import #163 : la section « Routine » ne s'affiche pas, vide, sur les
 * semaines passées). Nulle = sans borne, comme toutes les sections d'avant 0194.
 */
export function isSectionOn(section: { weekdays: string; starts_on: string | null }, date: string): boolean {
  return (
    section.weekdays.split(',').map(Number).includes(isoWeekday(date)) &&
    (section.starts_on === null || date >= section.starts_on)
  )
}

/**
 * Les habitudes dont l'occurrence est DUE, et encore virtuelle, dans une section un jour donné.
 * Leur place en haut de la section vient de leur `position` (`habitKey`, `order.ts`), rendue unique
 * et stable par 0193 : supprimer une habitude ne décale pas les autres.
 *
 * Partagée par la grille (`get-week.ts`) et par les actions qui posent une tâche à un rang : les
 * deux doivent voir la même section, sinon le rang calculé par le serveur ne serait pas celui
 * qu'on a visé à l'écran.
 */
export function dueHabits<
  H extends { id: string; label: string; category: string; weekdays: string; active: boolean; starts_on: string | null },
>(habits: readonly H[], date: string, category: string, rows: readonly OccurrenceRow[]): H[] {
  return habits.filter((h) => h.category === category && isDue(h, date) && !isMaterialized(h, date, rows))
}

/**
 * L'occurrence d'une habitude pour ce jour est-elle DÉJÀ une vraie ligne ? Si oui, la grille ne rend
 * pas l'occurrence virtuelle — sinon la même tâche apparaît deux fois.
 *
 * DEPUIS 0193, on la reconnaît à son habitude ET au jour dont elle est l'occurrence (`habitId`,
 * `habitDate`, posés par `materialize()`), où que la ligne soit ensuite : une occurrence RENOMMÉE
 * ou CHANGÉE DE JOUR dans la pop-up (#160) reste la sienne. Avant, l'intitulé et le jour la
 * reconnaissaient seuls — un titre ou un jour changé faisait renaître l'habitude.
 *
 * REPLI sur l'intitulé, dans la même section et le même jour, pour les lignes d'avant 0193
 * (`habitId` nul) — la règle d'origine, inchangée. Le Récap fait le même rapprochement en SQL
 * (0193, bloc `planned`) ; son repli par intitulé, lui, a toujours porté sur la journée entière.
 */
export function isMaterialized(
  habit: { id: string; label: string; category: string },
  date: string,
  rows: readonly OccurrenceRow[],
): boolean {
  return rows.some((t) =>
    t.habitId !== null
      ? t.habitId === habit.id && t.habitDate === date
      : t.date === date && t.category === habit.category && t.label === habit.label,
  )
}

/**
 * Une ligne s'affiche-t-elle ? Une occurrence SAUTÉE (« Juste aujourd'hui », 0195, #170) non : ni
 * dans la grille, ni dans le rang d'une section. Elle reste pourtant une occurrence — on la passe
 * toujours à `isMaterialized`, c'est elle qui empêche l'habitude de renaître ce jour-là.
 */
export const isShown = (row: { skipped: boolean }): boolean => !row.skipped

/**
 * Ce que fait la croix d'une vraie ligne (#170) : un 1:1 avec bilan se REFUSE (sa session resterait
 * orpheline) ; une occurrence d'habitude se SAUTE — effacée, l'habitude renaîtrait ce jour-là ; le
 * reste se SUPPRIME vraiment. `linked` : une ligne d'avant 0193 vient d'être reconnue comme
 * occurrence de son habitude (`legacyHabitLink`).
 */
export function deleteOutcome(
  row: { session_id: string | null; habit_id: string | null } | null,
  linked: boolean,
): 'refuse' | 'skip' | 'delete' {
  if (row?.session_id) return 'refuse'
  if (row && (row.habit_id !== null || linked)) return 'skip'
  return 'delete'
}

