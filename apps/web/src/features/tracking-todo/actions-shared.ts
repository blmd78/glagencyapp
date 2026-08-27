import { BusinessError } from '@/lib/actions'
import { getProfile } from '@/lib/auth'

/** Chemin de la to-do — revalidé par toutes ses mutations. */
export const TODO_PATH = '/chatter/presence/todo'

/** Le droit d'écrire quoi que ce soit sur une to-do de tracker : la page, ou être admin. */
async function requireTodoAccess() {
  const profile = await getProfile()
  if (!profile) throw new BusinessError('Session expirée.')
  // Le tracker d'origine exigeait un compte CRM pour toute écriture (`viewerFor`, 401 sinon) —
  // les chatteurs n'en avaient pas. Sans ce test, n'importe quel profil authentifié écrivait sa
  // to-do par Server Action, sur un écran qu'il ne voit même pas.
  if (profile.role !== 'admin' && !profile.pages.includes('presence')) {
    throw new BusinessError("Tu n'as pas accès au tracker.")
  }
  return profile
}

/**
 * LE TRAVAIL RESTE CELUI DE SON TITULAIRE — l'admin est ici volontairement BLOQUÉ.
 *
 * C'est la règle du tracker d'origine, dont le commentaire est sans ambiguïté : « Il ne coche pas,
 * ne déplace pas, ne touche ni aux habitudes ni au debrief » (routes.js.txt:277-281). Son
 * décorateur `todoApi` répond 403 « ce n'est pas ta semaine » dès que `owner !== v.accountId`,
 * SANS dérogation admin, sur la coche, le déplacement, les habitudes et les liens.
 *
 * Notre version autorisait l'admin partout — il pouvait donc cocher le travail d'un encadrant et
 * SIGNER SON DÉBRIEF à sa place. Les deux seules dérogations du legacy (déposer une tâche, la
 * retirer) vivent dans `assertOwnerOrAdmin`.
 *
 * Vérifié UNE fois, dans le handler — jamais en double dans `guard`.
 */
export async function assertOwner(ownerId: string): Promise<string> {
  const profile = await requireTodoAccess()
  if (profile.id !== ownerId) throw new BusinessError("Ce n'est pas ta semaine.")
  return profile.id
}

/**
 * Les DEUX dérogations de l'admin, et seulement elles : déposer une tâche chez quelqu'un
 * (`assignTarget`, routes.js.txt:282-304) et l'en retirer (« l'admin peut retirer ce qu'il a
 * déposé, ou corriger une erreur », routes.js.txt:306-315).
 * Rend l'id de l'appelant, pour tracer une tâche déposée par la hiérarchie.
 */
export async function assertOwnerOrAdmin(ownerId: string): Promise<string> {
  const profile = await requireTodoAccess()
  if (profile.role !== 'admin' && profile.id !== ownerId) {
    throw new BusinessError("Ce n'est pas ta semaine.")
  }
  return profile.id
}
