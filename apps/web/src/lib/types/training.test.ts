import { describe, expect, it } from 'vitest'
import { ARENA_REACTION_FALLBACK_S, SOLO_REACTION_S, reactionSecondsFor } from './training'

// Régression 6c23446 (2026-08-24) : le client lisait `reaction_max_s` BRUT, or il est null par
// contrainte SQL sur tout cas solo (`training_cases_reaction_kind`) — l'anneau restait plein et le
// chatter se prenait « Trop lent » sans jamais avoir vu tourner les 60 s. `reactionSecondsFor` est
// la source unique partagée par `dueAtFrom` (serveur) et l'affichage du chrono (client).
describe('reactionSecondsFor', () => {
  it('solo : 60 s même quand reaction_max_s est null (le cas NORMAL en base)', () => {
    expect(reactionSecondsFor('solo', null)).toBe(SOLO_REACTION_S)
    expect(reactionSecondsFor('solo', null)).toBe(60)
  })

  it('solo : la durée ne dépend jamais de reaction_max_s, même renseigné', () => {
    expect(reactionSecondsFor('solo', 300)).toBe(SOLO_REACTION_S)
  })

  it('défi / boss : la durée du cas fait foi', () => {
    expect(reactionSecondsFor('arena', 90)).toBe(90)
    expect(reactionSecondsFor('boss', 120)).toBe(120)
  })

  it('défi / boss sans durée : repli à 120 s', () => {
    expect(reactionSecondsFor('arena', null)).toBe(ARENA_REACTION_FALLBACK_S)
  })

  it('renvoie toujours une durée strictement positive (sinon anneau muet côté client)', () => {
    for (const [kind, max] of [['solo', null], ['arena', null], ['boss', 120]] as const) {
      expect(reactionSecondsFor(kind, max)).toBeGreaterThan(0)
    }
  })
})
