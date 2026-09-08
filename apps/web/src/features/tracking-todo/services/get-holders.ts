import { createAdminClient } from '@glagency/db'
import type { Profile } from '@/lib/auth'
import { canWriteTodo, TODO_ROLES } from '@/lib/tracking/todo-roles'

/**
 * Les encadrants dont l'appelant peut ouvrir la semaine de to-do.
 *
 * Leur écran a le même sélecteur (todo.html:578, un `<select>` des comptes). Sans lui, la
 * dérogation « déposer une tâche chez quelqu'un » existe côté serveur mais n'a aucun point
 * d'entrée : le bouton d'ajout ne s'affiche que sur une semaine ouverte, et rien ne permettait
 * d'ouvrir celle d'un autre.
 *
 * PÉRIMÈTRE, miroir exact de `canOrganizeTodoOf` (lib/tracking/todo-roles.ts) : un admin liste
 * tous ceux qui ont une to-do ; un manager ne liste QUE ses sous-managers rattachés ; un POLICIER
 * les liste TOUS (décision de Benoit du 2026-09-08 — il n'est rattaché à personne, cf.
 * `todo-roles.ts`) ; personne d'autre n'a de sélecteur. Le filtre est fait EN SQL et non après
 * coup : ce client est en service-role, un `.filter()` JavaScript sur un tableau déjà rapatrié
 * aurait quand même fait transiter l'annuaire complet de l'encadrement (superadmins compris) par
 * le serveur de rendu.
 *
 * Client admin — non par nécessité (la RLS `profiles_self_admin_or_team_read`, 0097, laisse admin
 * comme encadrant lire tous les profils) mais pour que cette liste ne dépende pas d'une policy qui
 * pourrait se resserrer : le cloisonnement est entièrement porté par le `where` ci-dessous, et il
 * doit se lire ici, en un seul endroit.
 */
export async function getTodoHolders(profile: Profile): Promise<{ id: string; name: string }[]> {
  const isAdmin = profile.role === 'admin'
  // `baseRole` et NON `role` : ce dernier écrase manager/sous-manager/police en 'chatteur'
  // (lib/auth). Un sous-manager, lui, n'encadre personne : pas de sélecteur.
  const isPolice = profile.baseRole === 'police'
  if (!isAdmin && profile.baseRole !== 'manager' && !isPolice) return []

  let query = createAdminClient()
    .from('profiles')
    .select('id, display_name, role, pages')
    .is('left_at', null)
    .order('display_name')

  query = isAdmin
    ? query.in('role', [...TODO_ROLES])
    : isPolice
      ? query.eq('role', 'sous-manager')
      : query.eq('role', 'sous-manager').contains('manager_ids', [profile.id])

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? [])
    // Ne proposer que ceux qui peuvent OUVRIR leur to-do — même règle que `canOrganizeTodoOf`, qui
    // refusera de toute façon le dépôt chez les autres. Filtré ici et non en SQL parce que le
    // `where` ci-dessus a déjà ramené la liste à quelques encadrants : le motif « filtrer en SQL »
    // visait l'annuaire complet, pas ce reliquat. Conséquence attendue au premier jour : tant que
    // personne ne porte le droit, le sélecteur est vide — il n'y a effectivement personne chez qui
    // déposer.
    .filter((p) => canWriteTodo(p.role, p.pages))
    .map((p) => ({ id: p.id, name: p.display_name ?? '—' }))
}
