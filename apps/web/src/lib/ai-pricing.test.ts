import { describe, expect, it } from 'vitest'
import { cacheMinTokens, usdOf } from './ai-pricing'

/**
 * Verrou de régression — le code existait déjà, ce sont les APPELANTS qui lui passaient `0`
 * pour l'écriture de cache du fan (corrigé par 0158). Ces ratios décident d'une facture : ils
 * méritent un test qui hurle si quelqu'un recopie le prix d'une sorte d'appel sur l'autre.
 */
describe('usdOf', () => {
  it('facture l’écriture de cache du fan à 1,25× l’entrée, et celle de la notation à 2×', () => {
    // TTL différents : le fan pose un marqueur sans TTL (5 min, 1,25×), la notation demande
    // explicitement 1 h (2×). Même volume, deux prix.
    const fan = usdOf([
      { model: 'claude-haiku-4-5', kind: 'fan', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000 },
    ])
    const score = usdOf([
      { model: 'claude-sonnet-5', kind: 'score', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000 },
    ])

    expect(fan).toBeCloseTo(1.25, 5) // 1 $/M d'entrée × 1,25
    expect(score).toBeCloseTo(4, 5) // 2 $/M d'entrée × 2
  })

  it('compte 0 pour un modèle absent du barème plutôt qu’un chiffre faux', () => {
    const usd = usdOf([
      { model: 'claude-futur-9', kind: 'fan', inputTokens: 10_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    ])

    expect(usd).toBe(0)
  })
})

describe('cacheMinTokens', () => {
  it('reconnaît un modèle par son PRÉFIXE, suffixe de date compris', () => {
    // Les ids en base portent la date de version : `claude-haiku-4-5-20251001`. Une égalité
    // stricte renverrait `null`, et la page perdrait le seuil qui fait tout son diagnostic.
    expect(cacheMinTokens('claude-haiku-4-5-20251001')).toBe(4096)
    expect(cacheMinTokens('claude-sonnet-5')).toBe(1024)
    expect(cacheMinTokens('claude-futur-9')).toBeNull()
  })
})
