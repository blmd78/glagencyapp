/**
 * La révélation différée des messages du fan — la règle, isolée pour être testable.
 *
 * POURQUOI ELLE EXISTE. Le corps d'un message du fan est retenu par le SERVEUR tant que son
 * échéance n'est pas passée (durcissement du 2026-08-21). Sans cette rétention, le texte
 * voyageait dans le payload RSC jusqu'à deux minutes avant sa révélation, lisible dans l'onglet
 * réseau : de quoi préparer sa réponse avant que le chrono de réaction s'arme, sur la mécanique
 * même qui alimente le classement et la roue.
 *
 * POURQUOI ELLE S'ARRÊTE À LA FIN DE LA SESSION. Ce que la rétention protège, c'est le chrono
 * d'une partie EN COURS. Une fois la session notée, ratée ou abandonnée, il n'y a plus rien à
 * préparer : plus de chrono, plus de points à gagner, et la conversation devient un support de
 * relecture. La retenir plus loin n'empêche aucune triche — elle affiche une bulle VIDE à la
 * place du dernier message du fan, exactement au moment où le chatteur ouvre son résultat.
 *
 * Mesuré en production le 2026-09-05 : sur 5 174 sessions notées en sept jours, 966 messages
 * avaient une échéance postérieure à la notation — soit une à trois bulles vides sur environ une
 * session sur cinq, pendant les 110 secondes qui suivent la fin de l'exercice.
 */

/** Statuts d'une session. Seul `active` se joue encore. */
export type RevealSessionStatus = 'active' | 'scored' | 'failed' | 'abandoned'

/**
 * Le corps de ce message doit-il être retenu par le serveur ?
 *
 * `visibleAtMs` est l'échéance de révélation, `nowMs` l'horloge du rendu — passée en paramètre
 * plutôt que lue ici, pour qu'un même rendu ne puisse pas encadrer une échéance avec deux
 * appels à `Date.now()` et livrer un message à moitié révélé.
 */
export function isBodyWithheld(
  status: RevealSessionStatus,
  visibleAtMs: number,
  nowMs: number,
): boolean {
  // Session terminée = plus de chrono à protéger. La conversation est relue, pas jouée.
  if (status !== 'active') return false
  return visibleAtMs > nowMs
}
