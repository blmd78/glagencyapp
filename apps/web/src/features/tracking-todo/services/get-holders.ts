import { createAdminClient } from '@glagency/db'
import type { Profile } from '@/lib/auth'

/** Les rôles qui ont une to-do dans le tracker (le legacy en donnait une à chaque encadrant). */
const ENCADRANTS = ['admin', 'superadmin', 'manager', 'sous-manager']

/**
 * Les encadrants dont l'appelant peut ouvrir la semaine de to-do.
 *
 * Leur écran a le même sélecteur (todo.html:578, un `<select>` des comptes). Sans lui, la
 * dérogation « déposer une tâche chez quelqu'un » existe côté serveur mais n'a aucun point
 * d'entrée : le bouton d'ajout ne s'affiche que sur une semaine ouverte, et rien ne permettait
 * d'ouvrir celle d'un autre.
 *
 * PÉRIMÈTRE, miroir exact de `canAssignTodoOf` (lib/tracking/todo-guards.ts) : un admin liste
 * tous les encadrants ; un manager ne liste QUE ses sous-managers rattachés ; personne d'autre
 * n'a de sélecteur. Le filtre est fait EN SQL et non après coup : ce client est en service-role,
 * un `.filter()` JavaScript sur un tableau déjà rapatrié aurait quand même fait transiter
 * l'annuaire complet de l'encadrement (superadmins compris) par le serveur de rendu.
 *
 * Client admin — non par nécessité (la RLS `profiles_self_admin_or_team_read`, 0097, laisse admin
 * comme encadrant lire tous les profils) mais pour que cette liste ne dépende pas d'une policy qui
 * pourrait se resserrer : le cloisonnement est entièrement porté par le `where` ci-dessous, et il
 * doit se lire ici, en un seul endroit.
 */
export async function getTodoHolders(profile: Profile): Promise<{ id: string; name: string }[]> {
  const isAdmin = profile.role === 'admin'
  // `baseRole` et NON `role` : ce dernier écrase manager/sous-manager en 'chatteur' (lib/auth),
  // et la dérogation s'arrête au manager — un sous-manager n'encadre personne.
  if (!isAdmin && profile.baseRole !== 'manager') return []

  let query = createAdminClient()
    .from('profiles')
    .select('id, display_name')
    .is('left_at', null)
    .order('display_name')

  query = isAdmin
    ? query.in('role', ENCADRANTS)
    : query.eq('role', 'sous-manager').contains('manager_ids', [profile.id])

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({ id: p.id, name: p.display_name ?? '—' }))
}
