/**
 * QUI A UNE TO-DO DE TRACKER, ET QUI PEUT GARNIR CELLE D'UN AUTRE — règle PURE.
 *
 * Sortie de `todo-guards.ts` (qui importe `next/cache` et le client Supabase, donc intestable
 * sans stub) le 2026-09-08, quand le rôle `police` est entré dans la To-Do : la règle est
 * désormais lue à QUATRE endroits — la garde d'écriture, la validation de `?owner=`, le
 * sélecteur de personnes (`getTodoHolders`, en SQL) et les drapeaux de l'écran
 * (`getTodoWeek`). Quatre formulations divergeraient. Même précédent que `habit-rules.ts` et
 * `features/snap-codes/access.ts`.
 *
 * ⚠️ Toutes ces fonctions attendent le rôle EXACT EN BASE (`Profile.baseRole`, ou la colonne
 * `profiles.role`) — jamais `Profile.role`, qui écrase manager/sous-manager/police en
 * 'chatteur' et ferait répondre « non » à un manager.
 */

/**
 * Les rôles dont on attend une to-do — donc ceux qui peuvent y écrire, et les seules cibles
 * chez qui on peut déposer.
 *
 * `police` depuis le 2026-09-08 (décision de Benoit : « policier c'est comme manager, ils
 * peuvent faire pareil sur les sous-mana »). Il était jusque-là absent, comme dans
 * `hasWriteAccess` (lib/auth) : la garde `requireWriteProfileLive('presence')` refusait au
 * policier jusqu'à la coche de SA propre tâche. La To-Do ne peut donc plus dériver son droit
 * d'écriture de `hasWriteAccess` — c'est le sens de `canWriteTodo` ci-dessous.
 *
 * `chatteur` n'y est pas et n'y sera pas : la case « Présence » de Membres n'est bornée par
 * aucun rôle (`config/workspaces.ts`), un chatteur à qui on la coche lit l'écran sans jamais
 * l'écrire.
 */
export const TODO_ROLES = ['superadmin', 'admin', 'manager', 'sous-manager', 'police'] as const

/**
 * Cette personne a-t-elle une to-do, et le droit d'y écrire ? Rôle à to-do ET droit d'ouvrir
 * l'écran (`presence`, dont l'admin est dispensé — il a tout).
 *
 * Une seule fonction pour les deux questions, parce que ce sont les mêmes : une to-do qu'on ne
 * peut pas écrire n'est pas une to-do. C'est ce qui la rend utilisable AUSSI SUR AUTRUI —
 * « la cible peut-elle ouvrir ce qu'on lui dépose ? » (l'ancien `canOpenTodo`, qui ne regardait
 * que le droit : un admin pouvait déposer chez un chatteur à qui « Présence » avait été
 * cochée, dans un écran que ce chatteur ne peut pas remplir).
 */
export function canWriteTodo(role: string | null, pages: string[] | null): boolean {
  if (!role || !(TODO_ROLES as readonly string[]).includes(role)) return false
  return role === 'admin' || role === 'superadmin' || (pages ?? []).includes('presence')
}

/** La cible d'une dérogation, telle que la base la rend. */
export interface TodoTarget {
  role: string | null
  pages: string[] | null
  /** `profiles.manager_ids` — le rattachement sous-manager → managers. */
  managerIds: string[] | null
}

/**
 * QUI PEUT OUVRIR ET GARNIR LA SEMAINE D'UN AUTRE — LA décision de toute la feature.
 *
 * • admin/superadmin : tout le monde (dérogation historique du legacy) ;
 * • manager : ses sous-managers RATTACHÉS — miroir applicatif de `can_manage_planning_of`
 *   (0102:205-218), rôle strict pour que la règle ne déborde pas sur les sous-managers ;
 * • police : TOUS les sous-managers, sans rattachement. Décision de Benoit, 2026-09-08 : les
 *   policiers ne sont rattachés à personne (`ATTACHABLE_ROLES.police` est vide depuis 0095) et
 *   il a tranché « tous les sous-managers » plutôt que de rouvrir le rattachement pour eux —
 *   les 3 policiers de la prod partagent donc le même périmètre, comme le Suivi chatters
 *   décloisonné le 2026-09-05 ;
 * • quiconque d'autre : personne. Un sous-manager n'encadre personne.
 *
 * La cible doit pouvoir OUVRIR sa to-do (`canWriteTodo`) : sans ce test on assigne du travail
 * dans un écran que la personne ne peut pas remplir — et la tâche déposée la fait ensuite
 * apparaître au Récap de son encadrement en « 0/N débriefs », c'est-à-dire le reproche
 * structurel que 0137 dit vouloir éviter. Vaut aussi pour l'admin, dont le `?owner=` visait
 * sinon n'importe quel uuid bien formé.
 *
 * On n'organise JAMAIS sa propre semaine par cette fonction : elle répond à la dérogation, pas
 * à la propriété. Les appelants traitent `callerId === ownerId` avant de l'interroger.
 */
export function canOrganizeTodoOf(params: {
  callerId: string
  callerRole: string
  target: TodoTarget
}): boolean {
  const { callerId, callerRole, target } = params
  if (!canWriteTodo(target.role, target.pages)) return false
  if (callerRole === 'admin' || callerRole === 'superadmin') return true
  if (target.role !== 'sous-manager') return false
  if (callerRole === 'police') return true
  return callerRole === 'manager' && (target.managerIds ?? []).includes(callerId)
}
