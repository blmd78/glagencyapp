import { describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { aiMessage, isAiBlocked } from './errors'

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

describe('aiMessage', () => {
  const opts = { retryable: 'réessaie', blocked: 'indisponible' }

  it('rend le message adapté selon la nature de la panne', () => {
    expect(aiMessage(new Anthropic.BadRequestError(400, body, 'x', h), opts)).toBe('indisponible')
    expect(aiMessage(new Anthropic.RateLimitError(429, body, 'x', h), opts)).toBe('réessaie')
  })
})
