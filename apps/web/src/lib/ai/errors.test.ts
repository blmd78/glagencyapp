import { describe, expect, it } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { aiMessage, isAiBlocked } from './errors'

/**
 * Incident du 2026-08-28 : solde Anthropic à zéro → `400 invalid_request_error` avec
 * `x-should-retry: false`, et l'app affichait « réessaie ». Trois tentatives pour rien.
 * Ces tests figent la frontière entre « réessayer a un sens » et « ça ne peut pas marcher ».
 */
const err = (Cls: new (s: number, e: unknown, m: string, h: Headers) => Anthropic.APIError, status: number) =>
  new Cls(status, { type: 'error', error: { type: 'invalid_request_error', message: 'x' } }, 'x', new Headers())

describe('isAiBlocked — réessayer est-il inutile ?', () => {
  it('solde épuisé ou requête invalide (400) : bloqué', () => {
    expect(isAiBlocked(err(Anthropic.BadRequestError, 400))).toBe(true)
  })

  it('clé absente, révoquée ou sans droit (401/403) : bloqué', () => {
    expect(isAiBlocked(err(Anthropic.AuthenticationError, 401))).toBe(true)
    expect(isAiBlocked(err(Anthropic.PermissionDeniedError, 403))).toBe(true)
  })

  it('modèle inconnu (404) : bloqué — un identifiant qui a bougé ne se répare pas en réessayant', () => {
    expect(isAiBlocked(err(Anthropic.NotFoundError, 404))).toBe(true)
  })

  it('clé absente de l’environnement : bloqué (erreur levée par notre propre fail-fast)', () => {
    expect(isAiBlocked(new Error('ANTHROPIC_API_KEY manquante (cf. .env.example…)'))).toBe(true)
  })

  it('surcharge et pannes serveur (429, 5xx) : PAS bloqué, réessayer a un sens', () => {
    expect(isAiBlocked(err(Anthropic.RateLimitError, 429))).toBe(false)
    expect(isAiBlocked(err(Anthropic.InternalServerError, 500))).toBe(false)
  })

  it('coupure réseau ou erreur inconnue : PAS bloqué — on ne condamne que ce qu’on reconnaît', () => {
    expect(isAiBlocked(new Error('fetch failed'))).toBe(false)
    expect(isAiBlocked(undefined)).toBe(false)
  })
})

describe('aiMessage', () => {
  const opts = { retryable: 'réessaie', blocked: 'indisponible' }

  it('rend le message adapté selon la nature de la panne', () => {
    expect(aiMessage(err(Anthropic.BadRequestError, 400), opts)).toBe('indisponible')
    expect(aiMessage(err(Anthropic.RateLimitError, 429), opts)).toBe('réessaie')
  })
})
