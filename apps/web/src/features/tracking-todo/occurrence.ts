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
