/**
 * Assignations membre × modèle (`profile_creators`) — LOGIQUE PURE de l'alignement fait par la fiche
 * Membre. La table est le PÉRIMÈTRE D'ACCÈS d'un membre (RLS) : ce qui décide de ce qu'on ajoute ou
 * retire doit être lisible et testé ici, pas noyé dans des appels Supabase. L'exécution (upsert des
 * ajouts D'ABORD, delete des retraits ENSUITE — un échec au milieu laisse au pire un surplus d'accès
 * temporaire, jamais un membre vidé) vit dans `apps/web` (`members/authz.ts`).
 *
 * Les PLACEMENTS sur le board (`profile_creators.shifts`, 0110) ne sont pas de son ressort : la fiche
 * ne fait qu'AMORCER une nouvelle assignation au shift principal du chatteur (l'exécuteur s'en
 * charge) ; ensuite le board les compose librement.
 */

export interface AssignmentSyncPlan {
  /** Modèles voulus qui n'existent pas encore — à upserter. */
  toAdd: string[]
  /** Modèles existants non voulus, dans le périmètre — à supprimer. */
  toRemove: string[]
}

/**
 * @param have    modèles actuellement assignés
 * @param wanted  modèles voulus par le formulaire (déjà validés contre le périmètre par l'appelant)
 * @param scope   périmètre de l'appelant (undefined = tout) : on ne RETIRE que dedans — une
 *                assignation posée par un admin hors périmètre est préservée telle quelle
 */
export function planAssignmentSync(
  have: ReadonlySet<string>,
  wanted: readonly string[],
  scope: ReadonlySet<string> | undefined,
): AssignmentSyncPlan {
  const want = new Set(wanted)
  const inScope = (id: string) => !scope || scope.has(id)
  return {
    toAdd: wanted.filter((id) => !have.has(id)),
    toRemove: [...have].filter((id) => !want.has(id) && inScope(id)),
  }
}
