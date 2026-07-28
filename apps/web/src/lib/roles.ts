import { STATUS_COLORS } from '@/lib/status-color'

/**
 * LA table des noms de rôle affichés — source unique de l'app. Avant, trois endroits les
 * nommaient à la main et divergeaient déjà (`members-table.tsx` disait « Superadmin » là où le
 * sélecteur de personne disait « propriétaire »).
 *
 * Ce n'est PAS la liste des rôles autorisés (`features/members/authz.ts`, `schema.ts`) ni
 * l'ordre hiérarchique : seulement l'affichage.
 */
export const ROLE_NAME: Record<string, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  manager: 'Manager',
  'sous-manager': 'Sous-manager',
  police: 'Police',
  chatteur: 'Chatter',
}

/**
 * Teinte du badge de rôle — reprise telle quelle des badges de la page Membres, qui les
 * codaient en dur : bleu = direction, vert = encadrement, ambre = rôle fonctionnel, gris =
 * chatter. Même palette sémantique que le reste de l'app (`lib/status-color.ts`).
 */
export const ROLE_TONE: Record<string, string> = {
  superadmin: STATUS_COLORS.info,
  admin: STATUS_COLORS.info,
  manager: STATUS_COLORS.positive,
  'sous-manager': STATUS_COLORS.positive,
  police: STATUS_COLORS.warning,
  chatteur: STATUS_COLORS.neutral,
}

/**
 * Même nom, en registre « accolé après un prénom » (« Axel · sous-manager ») — sélecteur de
 * personne et pile de noms. Dérivé de `ROLE_NAME` pour qu'un renommage ne puisse pas ne
 * s'appliquer qu'à moitié. `''` = pas de suffixe : soi-même (`role: ''`), `'user'` transitoire
 * de 0059, ou toute valeur inconnue.
 */
export const roleLabel = (role: string): string => (ROLE_NAME[role] ?? '').toLowerCase()
