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
 * Teinte du badge de rôle — code couleur unifié de l'app (décision Benoit 2026-07-29,
 * aligné sur Organisation et le planning repos) : CHATTER en bleu, MANAGER/SOUS-MANAGER en
 * vert, POLICE en orange ; la direction garde son ton info, le violet reste aux modèles.
 */
export const ROLE_TONE: Record<string, string> = {
  superadmin: STATUS_COLORS.info,
  admin: STATUS_COLORS.info,
  manager: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  'sous-manager': 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  police: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  chatteur: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
}

/**
 * Même nom, en registre « accolé après un prénom » (« Axel · sous-manager ») — sélecteur de
 * personne et pile de noms. Dérivé de `ROLE_NAME` pour qu'un renommage ne puisse pas ne
 * s'appliquer qu'à moitié. `''` = pas de suffixe : soi-même (`role: ''`), `'user'` transitoire
 * de 0059, ou toute valeur inconnue.
 */
export const roleLabel = (role: string): string => (ROLE_NAME[role] ?? '').toLowerCase()
