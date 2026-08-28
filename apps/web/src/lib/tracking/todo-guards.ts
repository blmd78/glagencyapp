import { BusinessError, requirePageProfileLive } from '@/lib/actions'

/**
 * Gardes de propriété de la To-Do du tracker.
 *
 * En `lib/` et non dans la feature parce qu'elles sont PARTAGÉES : la clôture d'une tâche « 1:1 »
 * (`complete-one-to-one.ts`) est déclenchée depuis l'écran de suivi, et la frontière ESLint
 * interdit à `tracking-coaching` d'importer `tracking-todo`. Même précédent que
 * `lib/training/start-session.ts` et `lib/impersonation/actions.ts`.
 */


/** Chemin de la to-do — revalidé par toutes ses mutations. */
export const TODO_PATH = '/chatter/presence/todo'

/** Le droit d'écrire quoi que ce soit sur une to-do de tracker : la page, ou être admin. */
async function requireTodoAccess() {
  // Le tracker d'origine exigeait un compte CRM pour toute écriture (`viewerFor`, 401 sinon) — les
  // chatteurs n'en avaient pas. Sans ce test, n'importe quel profil authentifié écrivait sa to-do
  // par Server Action, sur un écran qu'il ne voit même pas.
  //
  // Le suffixe `Live` refuse en plus la consultation « en tant que » : on ne coche pas, et surtout
  // on ne signe pas le débrief de quelqu'un sous son identité. Même garde que la face Formation,
  // dont ce fichier revendique le patron.
  return requirePageProfileLive('presence')
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
