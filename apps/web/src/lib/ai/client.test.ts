import { describe, expect, it, vi } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { withOverloadFallback } from './client'

/**
 * Vague du 2026-09-02 (14h28-14h45 Paris) : `529 overloaded_error` sans discontinuer sur le modèle
 * du fan, 79 envois en échec, toute la formation bloquée — alors que le reste de l'API répondait.
 * Ces tests figent le contournement : sur saturation, et sur elle seule, la requête repart sur un
 * second modèle.
 */
const body = { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }
const h = new Headers()
const overloaded = () => new Anthropic.InternalServerError(529, body, 'Overloaded', h)
const models = { model: 'principal', fallbackModel: 'secours' }

describe('withOverloadFallback', () => {
  it('modèle disponible : un seul appel, pas de repli', async () => {
    const attempt = vi.fn().mockResolvedValue('ok')
    await expect(withOverloadFallback(attempt, models)).resolves.toBe('ok')
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(attempt.mock.calls[0][0]).toBe('principal')
  })

  it('modèle saturé (529) : la MÊME requête repart sur le modèle de secours', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const attempt = vi.fn().mockRejectedValueOnce(overloaded()).mockResolvedValue('ok')
    await expect(withOverloadFallback(attempt, models)).resolves.toBe('ok')
    expect(attempt).toHaveBeenCalledTimes(2)
    expect(attempt.mock.calls[1][0]).toBe('secours')
  })

  it('429 et 503 basculent aussi — même famille de limite passagère', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const err of [new Anthropic.RateLimitError(429, body, 'x', h), new Anthropic.InternalServerError(503, body, 'x', h)]) {
      const attempt = vi.fn().mockRejectedValueOnce(err).mockResolvedValue('ok')
      await expect(withOverloadFallback(attempt, models)).resolves.toBe('ok')
      expect(attempt).toHaveBeenCalledTimes(2)
    }
  })

  it('panne qui n’est PAS une saturation : aucun repli — on ne paie pas deux fois le même échec', async () => {
    const attempt = vi.fn().mockRejectedValue(new Anthropic.BadRequestError(400, body, 'x', h))
    await expect(withOverloadFallback(attempt, models)).rejects.toBeInstanceOf(Anthropic.BadRequestError)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('repli saturé lui aussi : c’est l’erreur D’ORIGINE qui remonte (la cause du tour perdu)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = overloaded()
    const attempt = vi.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(new Anthropic.NotFoundError(404, body, 'x', h))
    await expect(withOverloadFallback(attempt, models)).rejects.toBe(first)
  })

  it('le fan garde un timeout court : un chatteur attend devant son écran', async () => {
    const attempt = vi.fn().mockResolvedValue('ok')
    await withOverloadFallback(attempt, models)
    expect(attempt.mock.calls[0][1]).toEqual({ maxRetries: 2, timeout: 8_000 })
  })
})
