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
 * Le message rendu à l'utilisateur : `blocked` quand réessayer est inutile, `overloaded` quand il
 * faut LAISSER PASSER la vague, `retryable` sinon.
 *
 * Les trois textes restent volontairement muets sur la cause (solde, clé, capacité du fournisseur) :
 * un chatteur — et surtout un CANDIDAT sur le test public — n'a pas à lire l'état de facturation de
 * l'agence. Le détail est dans Sentry et dans les logs, pour qui peut agir.
 *
 * `overloaded` est optionnel : sans lui, une saturation retombe sur `retryable` — le comportement
 * d'avant le 2026-09-02, correct mais qui invite à recliquer tout de suite.
 */
export function aiMessage(err: unknown, opts: { retryable: string; blocked: string; overloaded?: string }): string {
  if (isAiBlocked(err)) return opts.blocked
  if (opts.overloaded && isAiOverloaded(err)) return opts.overloaded
  return opts.retryable
}

/**
 * La panne est-elle une SATURATION passagère du fournisseur ?
 *
 * Le 2026-09-02, entre 14h28 et 14h45 (Paris), l'API a répondu `529 overloaded_error` sur le modèle
 * du fan pendant 17 minutes d'affilée (79 envois en échec, aucun incident déclaré sur
 * status.claude.com : la capacité d'un modèle se sature sans que ce soit une panne). Les chatteurs
 * en formation lisaient « le fan n'a pas répondu — réessaie » et recliquaient : chaque clic
 * renvoyait trois tentatives de plus vers une API déjà saturée, pendant 17 minutes.
 *
 * Une saturation se distingue des autres pannes rejouables sur DEUX points, d'où cette fonction :
 *  - elle se contourne (`withOverloadFallback` rejoue la requête sur un modèle de secours, dont la
 *    capacité est indépendante) ;
 *  - quand le contournement échoue lui aussi, réessayer TOUT DE SUITE est inutile — le message doit
 *    dire d'attendre, pas d'insister.
 *
 * 529 est la saturation proprement dite ; 503 et 429 sont le même genre de limite passagère. Les
 * autres 5xx restent des pannes ordinaires : rejouables, mais pas au sens « attends, ça revient ».
 */
export function isAiOverloaded(err: unknown): boolean {
  return err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503 || err.status === 429)
}
