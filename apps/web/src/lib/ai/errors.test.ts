import { describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { aiMessage, isAiBlocked, isAiOverloaded } from './errors'

/**
 * Incident du 2026-08-28 : solde Anthropic à zéro → `400 invalid_request_error` avec
 * `x-should-retry: false`, et l'app affichait « réessaie ». Trois tentatives pour rien.
 * Ces tests figent la frontière entre « réessayer a un sens » et « ça ne peut pas marcher ».
 */
const body = { type: 'error', error: { type: 'invalid_request_error', message: 'x' } }
const h = new Headers()

describe('isAiBlocked — réessayer est-il inutile ?', () => {
  it('solde épuisé ou requête invalide (400) : bloqué', () => {
    expect(isAiBlocked(new Anthropic.BadRequestError(400, body, 'x', h))).toBe(true)
  })

  it('clé absente, révoquée ou sans droit (401/403) : bloqué', () => {
    expect(isAiBlocked(new Anthropic.AuthenticationError(401, body, 'x', h))).toBe(true)
    expect(isAiBlocked(new Anthropic.PermissionDeniedError(403, body, 'x', h))).toBe(true)
  })

  it('modèle inconnu (404) : bloqué — un identifiant qui a bougé ne se répare pas en réessayant', () => {
    expect(isAiBlocked(new Anthropic.NotFoundError(404, body, 'x', h))).toBe(true)
  })

  it('clé absente de l’environnement : bloqué (erreur levée par notre propre fail-fast)', () => {
    expect(isAiBlocked(new Error('ANTHROPIC_API_KEY manquante (cf. .env.example…)'))).toBe(true)
  })

  it('surcharge et pannes serveur (429, 5xx) : PAS bloqué, réessayer a un sens', () => {
    expect(isAiBlocked(new Anthropic.RateLimitError(429, body, 'x', h))).toBe(false)
    expect(isAiBlocked(new Anthropic.InternalServerError(500, body, 'x', h))).toBe(false)
  })

  it('coupure réseau ou erreur inconnue : PAS bloqué — on ne condamne que ce qu’on reconnaît', () => {
    expect(isAiBlocked(new Error('fetch failed'))).toBe(false)
    expect(isAiBlocked(undefined)).toBe(false)
  })
})

/**
 * Vague du 2026-09-02 : `529 overloaded_error` 17 minutes durant sur le modèle du fan. « Réessaie »
 * était vrai mais nuisible — chaque clic renvoyait trois tentatives vers une API déjà saturée.
 */
describe('isAiOverloaded — faut-il LAISSER PASSER la vague ?', () => {
  it('529, 503, 429 : saturation', () => {
    expect(isAiOverloaded(new Anthropic.InternalServerError(529, body, 'x', h))).toBe(true)
    expect(isAiOverloaded(new Anthropic.InternalServerError(503, body, 'x', h))).toBe(true)
    expect(isAiOverloaded(new Anthropic.RateLimitError(429, body, 'x', h))).toBe(true)
  })

  it('500 ou coupure réseau : panne ordinaire, pas une saturation — réessayer tout de suite a du sens', () => {
    expect(isAiOverloaded(new Anthropic.InternalServerError(500, body, 'x', h))).toBe(false)
    expect(isAiOverloaded(new Error('fetch failed'))).toBe(false)
  })

  it('400 : bloqué, jamais « saturé » — les deux classifications ne se marchent pas dessus', () => {
    const err = new Anthropic.BadRequestError(400, body, 'x', h)
    expect(isAiOverloaded(err)).toBe(false)
    expect(isAiBlocked(err)).toBe(true)
  })
})

describe('aiMessage', () => {
  const opts = { retryable: 'réessaie', blocked: 'indisponible' }
  const withWait = { ...opts, overloaded: 'attends' }

  it('rend le message adapté selon la nature de la panne', () => {
    expect(aiMessage(new Anthropic.BadRequestError(400, body, 'x', h), opts)).toBe('indisponible')
    expect(aiMessage(new Anthropic.RateLimitError(429, body, 'x', h), opts)).toBe('réessaie')
  })

  it('saturation : « attends » plutôt que « réessaie », quand l’appelant l’a prévu', () => {
    expect(aiMessage(new Anthropic.InternalServerError(529, body, 'x', h), withWait)).toBe('attends')
    // Sans texte dédié, le comportement d'avant le 2026-09-02 : une saturation reste rejouable.
    expect(aiMessage(new Anthropic.InternalServerError(529, body, 'x', h), opts)).toBe('réessaie')
  })

  it('« bloqué » l’emporte sur « saturé » : une clé révoquée ne s’attend pas', () => {
    expect(aiMessage(new Anthropic.AuthenticationError(401, body, 'x', h), withWait)).toBe('indisponible')
  })
})
