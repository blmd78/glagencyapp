import { describe, expect, it } from 'vitest'
import { isBodyWithheld } from './reveal'

const T = Date.parse('2026-09-05T10:00:00Z')
const AVANT = T - 60_000
const APRES = T + 60_000

describe('isBodyWithheld — session EN COURS', () => {
  it('retient un message dont l’échéance n’est pas passée', () => {
    expect(isBodyWithheld('active', APRES, T)).toBe(true)
  })

  it('livre un message déjà révélé', () => {
    expect(isBodyWithheld('active', AVANT, T)).toBe(false)
  })

  it('livre à la seconde EXACTE de l’échéance — pas une de plus', () => {
    // La comparaison est stricte : à l'instant pile, le message est dû.
    expect(isBodyWithheld('active', T, T)).toBe(false)
  })
})

// RÉGRESSION DU 2026-08-21, constatée par les chatteurs le 2026-09-05 : « on ne voit plus la
// dernière conv avec l'IA quand on termine un exo ». La rétention ne regardait pas le statut de
// la session, si bien qu'un message dont l'échéance tombait APRÈS la notation restait vide sur
// l'écran de résultat — une bulle blanche à la place de la dernière réplique du fan.
//
// Mesuré en production : 966 messages en sept jours, une à trois bulles par session concernée,
// pendant les 110 secondes suivant la fin de l'exercice.
describe('isBodyWithheld — session TERMINÉE : plus rien à retenir', () => {
  it('livre le message même si son échéance n’est pas passée (notée)', () => {
    expect(isBodyWithheld('scored', APRES, T)).toBe(false)
  })

  it('livre aussi sur une session ratée — le chrono a expiré, la conv se relit', () => {
    expect(isBodyWithheld('failed', APRES, T)).toBe(false)
  })

  it('livre aussi sur un abandon', () => {
    expect(isBodyWithheld('abandoned', APRES, T)).toBe(false)
  })
})
