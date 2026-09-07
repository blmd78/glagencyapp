/**
 * QUI PEUT TOUCHER UNE HABITUDE — règle PURE, la seule phrase qui décide.
 *
 * Lue à DEUX endroits, et c'est sa raison d'être : la garde serveur (`assertCanEditHabit`, qui
 * refuse) et la lecture de la semaine (`getTodoWeek`, qui rend `canEdit` par habitude pour que le
 * panneau n'affiche que des boutons qui marchent). Deux formulations divergeraient — l'UI
 * promettrait un geste que le serveur refuse, ou cacherait un geste permis. Même précédent que
 * `features/snap-codes/access.ts` : module pur pour se tester sans stub Next/Supabase, puisque
 * `todo-guards.ts` importe `next/cache` et le client Supabase.
 *
 * Les trois cas, dans l'ordre :
 *
 * • admin/superadmin : partout — c'est la dérogation historique du legacy, celle qui lui laisse
 *   « corriger une erreur » (routes.js.txt:306-315, reprise dans `assertCanUnassign`) ;
 * • le DÉPOSANT : ce qu'il a posé, et cela seul ;
 * • le TITULAIRE : ses propres habitudes (`created_by is null`) — mais PAS celles qu'on lui a
 *   déposées. Décision de Benoit, 2026-09-07 : « l'habitude déposée est verrouillée pour lui ».
 *   C'est le sens même de la demande — si le sous-manager peut éteindre le rituel qu'on lui pose,
 *   on est revenu à devoir le renoter. Il garde une issue, « juste aujourd'hui »
 *   (`deleteTaskOccurrence`), qui saute UNE occurrence sans toucher au gabarit.
 *
 * Ce que cette règle NE dit PAS : le droit d'ouvrir la page (`requireWriteProfileLive('presence')`)
 * ni la dérogation de dépôt sur cette semaine-là (`canAssignTodoOf`). Les deux gardes qui
 * l'appellent posent ces questions AVANT — ici on ne tranche que la propriété du gabarit.
 */

/**
 * `callerRole` accepte les DEUX formes en circulation : `Profile.role` (où `superadmin` est déjà
 * mappé sur `admin`) et `Profile.baseRole` (rôle exact en base, donc `superadmin` tel quel). Les
 * tester tous les deux évite d'avoir à se souvenir laquelle l'appelant tenait en main.
 */
export function canEditHabit(params: {
  callerId: string
  callerRole: string
  ownerId: string
  /** `created_by` du gabarit — `null` = le titulaire se l'est donnée lui-même. */
  createdBy: string | null
}): boolean {
  if (params.callerRole === 'admin' || params.callerRole === 'superadmin') return true
  if (params.createdBy !== null) return params.createdBy === params.callerId
  return params.callerId === params.ownerId
}
