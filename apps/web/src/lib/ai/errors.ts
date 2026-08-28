import Anthropic from '@anthropic-ai/sdk'

/**
 * Une panne IA est-elle REJOUABLE ?
 *
 * Le 2026-08-28, le solde de crédit Anthropic est tombé à zéro : l'API a répondu `400
 * invalid_request_error` (« Your credit balance is too low ») avec `x-should-retry: false`, et
 * l'app a affiché « réessaie » — invitant à trois tentatives qui ne pouvaient pas aboutir. Sentry
 * avait bien alerté ; c'est la personne devant l'écran qui n'avait aucune information utile.
 *
 * Classification par TYPE d'exception du SDK, jamais sur le texte du message : celui-ci change de
 * formulation et de langue d'une version à l'autre.
 *
 *  - 400 `BadRequestError` : solde épuisé, requête invalide. Réessayer ne changera rien.
 *  - 401 / 403 : clé absente, révoquée ou sans droit sur le modèle. Problème de configuration.
 *  - 404 : modèle inconnu (un identifiant qui a bougé). Configuration, là aussi.
 *  - Tout le reste (429, 5xx, coupure réseau) : passager, le SDK a déjà réessayé deux fois, mais
 *    une nouvelle tentative de l'utilisateur a du sens.
 *
 * `anthropic()` lève aussi une `Error` nue quand `ANTHROPIC_API_KEY` manque (fail-fast) — d'où le
 * test sur le message en dernier recours : c'est NOTRE chaîne, pas celle du fournisseur.
 */
export function isAiBlocked(err: unknown): boolean {
  if (err instanceof Anthropic.BadRequestError) return true
  if (err instanceof Anthropic.AuthenticationError) return true
  if (err instanceof Anthropic.PermissionDeniedError) return true
  if (err instanceof Anthropic.NotFoundError) return true
  if (err instanceof Error && err.message.startsWith('ANTHROPIC_API_KEY manquante')) return true
  return false
}

/**
 * Le message rendu à l'utilisateur : `blocked` quand réessayer est inutile, `retryable` sinon.
 *
 * Les deux textes restent volontairement muets sur la cause (solde, clé) : un chatteur — et
 * surtout un CANDIDAT sur le test public — n'a pas à lire l'état de facturation de l'agence. Le
 * détail est dans Sentry et dans les logs, pour qui peut agir.
 */
export function aiMessage(err: unknown, opts: { retryable: string; blocked: string }): string {
  return isAiBlocked(err) ? opts.blocked : opts.retryable
}
