import { createAdminClient } from '@glagency/db'

/**
 * Les encadrants dont un admin peut ouvrir la semaine de to-do.
 *
 * Leur écran a le même sélecteur (todo.html:578, un `<select>` des comptes). Sans lui, la
 * dérogation « déposer une tâche chez quelqu'un » existe côté serveur mais n'a aucun point
 * d'entrée : le bouton d'ajout ne s'affiche que sur une semaine ouverte, et rien ne permettait
 * d'ouvrir celle d'un autre.
 *
 * TOUS les encadrants (manager, sous-manager) + admins : dans le tracker d'origine chaque manager
 * a sa to-do, alors on les liste tous — pas seulement les porteurs actuels du droit `presence`,
 * qui n'est encore attribué à personne. Client admin — la RLS de `profiles` ne laisse pas un admin
 * lister les autres par le client session, et cette liste ne sert qu'à un admin (la page ne
 * l'appelle pas autrement).
 */
export async function getTodoHolders(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id, display_name, role')
    .is('left_at', null)
    .order('display_name')
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((p) => ['admin', 'superadmin', 'manager', 'sous-manager'].includes(p.role ?? ''))
    .map((p) => ({ id: p.id, name: p.display_name ?? '—' }))
}
