// Appel d'une Server Action publique depuis le parcours `/postuler`, avec la seule chose que
// `ActionResult` ne dit pas : QUI a fabriqué l'échec.
//
// Une action qui refuse rend `{ success: false, error }` ; une action qu'on n'a pas pu joindre
// REJETTE (réseau coupé, onglet en veille, déploiement en cours). Les deux arrivent au même
// endroit côté appelant, et pourtant ils n'appellent pas la même réaction : un refus métier à
// l'entrée du test est un cul-de-sac assumé (« déjà passé », « fermé »), une coupure réseau doit
// rester réessayable — d'où le marqueur `transport`.
//
// Module sans composant, voisin de `flow-state.ts` : il ne porte que le contrat d'appel.

import type { ActionResult } from '@/lib/actions'

/** Message unique des rejets réseau — le candidat n'a pas à distinguer les causes. */
export const OFFLINE = 'Connexion perdue — réessaie.'

/**
 * `ActionResult`, plus le marqueur `transport` posé UNIQUEMENT par `safe()` sur un rejet attrapé.
 * Absent = c'est l'action qui a répondu non.
 */
export type SafeResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]>; transport?: true }

/**
 * Sans ce filet, un appel qui échoue au réseau partirait en rejet non géré et l'écran se figerait
 * sans rien dire.
 */
export async function safe<T>(run: () => Promise<ActionResult<T>>): Promise<SafeResult<T>> {
  try {
    return await run()
  } catch {
    return { success: false, error: OFFLINE, transport: true }
  }
}
