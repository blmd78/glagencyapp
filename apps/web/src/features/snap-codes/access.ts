/**
 * Qui peut ÉCRIRE quel code Snap — règle PURE, partagée par la page (colonnes éditables) et par
 * l'action (`saveSnapCode`), pour qu'une seule phrase la décrive :
 *
 * - admin : tous les modèles ;
 * - manager / sous-manager porteur de la page « Codes Snap » : SES modèles assignés
 *   (`profile_creators`) et eux seuls — sans assignation, aucun : des identifiants ne s'ouvrent
 *   pas par défaut, contrairement au repli « pas de borne » du périmètre Police ;
 * - chatteur, police : aucun, la page reste en lecture.
 *
 * Hotfix du 2026-09-03 (demande d'un manager : « je ne peux pas changer les identifiants Snap de
 * mes 3 modèles ») — l'écriture était réservée aux admins depuis le portage de gla-workflow.
 *
 * Reprend la branche manager de `hasWriteAccess` (lib/auth) — copie VOLONTAIRE : le module reste
 * pur pour se tester sans stub Next/Supabase ; à garder aligné si la règle d'écriture change.
 * À l'écran, un encadrant ne voit de toute façon que SES modèles (RLS `creators_scoped_read`) :
 * la liste des modèles éditables est la sortie de la règle, pas une seconde barrière.
 */

import type { Profile } from '@/lib/auth'

export type SnapWriter = Pick<Profile, 'role' | 'manager' | 'pages'>

/** `assigned` = modèles assignés à l'appelant (`getCreatorScope`), `null` = aucune assignation. */
export function canWriteSnapCode(
  profile: SnapWriter,
  assigned: Set<string> | null,
  creatorId: string,
): boolean {
  if (profile.role === 'admin') return true
  if (!profile.manager || !profile.pages.includes('codes-snap')) return false
  return assigned?.has(creatorId) ?? false
}

/** Les modèles éditables parmi `allCreatorIds`, dans l'ordre de la liste (celui du tableau). */
export function writableCreatorIds(
  profile: SnapWriter,
  assigned: Set<string> | null,
  allCreatorIds: string[],
): string[] {
  return allCreatorIds.filter((id) => canWriteSnapCode(profile, assigned, id))
}
