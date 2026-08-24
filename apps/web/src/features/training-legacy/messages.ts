/**
 * Les textes de la réclamation — SOURCE UNIQUE (spec §2.3, mot pour mot).
 *
 * LA RÈGLE : tout ce qui se produit AVANT la preuve du mot de passe rend UN SEUL ET MÊME TEXTE.
 * Sinon la réclamation devient un oracle qui permet d'énumérer les 248 logins existants, puis de
 * les attaquer. Mesuré sur GLA le 2026-08-24 : 4 mots de passe SONT le login lui-même, 15 font 4
 * caractères ou moins, 44 en font 6 ou moins — de quoi tomber en quelques secondes. Login inconnu,
 * mot de passe faux, compte sans sel : le même mot, toujours.
 *
 * Le GEL PAR LOGIN rend EXACTEMENT le texte du plafond par profil, et ce n'est pas une paresse :
 * lui donner une phrase propre le transformerait en signal « ce login est activement ciblé », donc
 * en outil de reconnaissance.
 *
 * Les DEUX seules exceptions explicites ne sont atteignables qu'APRÈS la preuve : elles ne
 * divulguent rien qu'un attaquant ne sache déjà, et elles évitent d'enfermer un légitime dans un
 * message opaque.
 */

/** Le message générique — tout ce qui précède la preuve. */
export const NOT_FOUND = 'Identifiants introuvables.'
export const RATE_LIMITED = 'Trop de tentatives. Réessayez dans quelques minutes.'
export const LOCKED = 'Récupération bloquée. Contactez un administrateur.'
export const GLA_DOWN = 'L’ancienne plateforme est momentanément injoignable. Réessayez dans quelques minutes.'
export const RESYNC_COOLDOWN = 'Historique déjà synchronisé récemment. Réessayez dans une heure.'
export const SYNC_RUNNING = 'Récupération en cours — patientez quelques minutes avant de relancer.'
export const INTERRUPTED = 'Récupération interrompue — une partie de votre historique est déjà en place. Relancez pour terminer.'
export const TAKEN = 'Cet identifiant est déjà rattaché à un autre compte. Contactez un administrateur.'
export const INCOMPLETE = 'Récupération incomplète — un administrateur a été alerté.'
export const IMPOSSIBLE = 'Récupération impossible — un administrateur a été alerté.'
export const NO_CLAIM = 'Aucun ancien compte n’est rattaché à votre profil.'

/** « Votre compte est déjà rattaché à l'identifiant « ancien-login ». » */
export const otherLogin = (loginDisplay: string) =>
  `Votre compte est déjà rattaché à l’identifiant « ${loginDisplay} ». Contactez un administrateur pour le modifier.`

const FR = new Intl.NumberFormat('fr-FR')

/**
 * La phrase de succès. Quatre cas, et l'ordre compte : « Votre historique est déjà à jour » est le
 * message le plus rassurant de la liste — il n'est rendu qu'après le contrôle de comptage de §3.9,
 * sans lequel il serait servi à quelqu'un dont l'historique est chez un autre profil, un vol
 * indétectable par sa victime.
 */
export function successMessage(s: { sessions: number; newSessions: number; cases: number; messages: number }): string {
  // 16 comptes GLA n'ont aucune session : le rattachement est réel, il n'y a juste rien à reprendre.
  if (s.sessions === 0) return 'Compte retrouvé — aucune session à reprendre.'
  // Tout est neuf : première réclamation, ou re-réclamation après un détachement.
  if (s.newSessions === s.sessions) {
    return `Historique repris : ${FR.format(s.sessions)} sessions, ${FR.format(s.cases)} cas, ${FR.format(s.messages)} messages.`
  }
  if (s.newSessions > 0) return `${FR.format(s.newSessions)} nouvelles sessions reprises.`
  return 'Votre historique est déjà à jour.'
}
