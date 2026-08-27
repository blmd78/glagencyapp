import { BusinessError } from '@/lib/actions'
import { getProfile } from '@/lib/auth'

/** Chemin de la to-do — revalidé par toutes ses mutations. */
export const TODO_PATH = '/chatter/presence/todo'

/**
 * Chacun gère SA to-do ; un admin peut agir sur n'importe laquelle. Vérifié UNE fois, dans le
 * handler — jamais en double dans `guard`, ce que la checklist des guidelines interdit.
 * Rend l'id de l'appelant, pour tracer une tâche déposée par la hiérarchie.
 */
export async function assertOwner(ownerId: string): Promise<string> {
  const profile = await getProfile()
  if (!profile) throw new BusinessError('Session expirée.')
  const allowed = profile.role === 'admin' || profile.id === ownerId
  if (!allowed) throw new BusinessError("Cette to-do n'est pas la tienne.")
  return profile.id
}
