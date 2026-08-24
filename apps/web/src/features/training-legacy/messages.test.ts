import { describe, expect, it } from 'vitest'
import { NOT_FOUND, RATE_LIMITED, successMessage } from './messages'

/**
 * Ces textes ne sont pas cosmétiques : ils sont la surface d'attaque du formulaire.
 * `NOT_FOUND` doit rester le SEUL message rendu par tout ce qui précède la preuve (sinon la
 * réclamation devient un annuaire des 248 logins existants), et « déjà à jour » ne doit jamais
 * sortir quand rien n'a été repris — c'est le message le plus rassurant de la liste, et il serait
 * servi à quelqu'un dont l'historique est chez un autre profil.
 */
describe('successMessage', () => {
  it('dit qu’il n’y a rien à reprendre quand le compte GLA est vide (14 comptes concernés)', () => {
    expect(successMessage({ sessions: 0, newSessions: 0, cases: 0, messages: 0 })).toBe(
      'Compte retrouvé — aucune session à reprendre.',
    )
  })

  it('rend le détail chiffré quand TOUT est neuf (première réclamation)', () => {
    expect(successMessage({ sessions: 214, newSessions: 214, cases: 68, messages: 3812 })).toBe(
      // U+202F (espace fine insécable) : c'est ce que rend `Intl.NumberFormat('fr-FR')`.
      'Historique repris : 214 sessions, 68 cas, 3 812 messages.',
    )
  })

  it('rend le seul delta sur une resynchronisation qui rapporte du neuf', () => {
    expect(successMessage({ sessions: 226, newSessions: 12, cases: 68, messages: 4000 })).toBe(
      '12 nouvelles sessions reprises.',
    )
  })

  it('ne dit « déjà à jour » que si des sessions existent ET que rien n’a bougé', () => {
    expect(successMessage({ sessions: 214, newSessions: 0, cases: 68, messages: 3812 })).toBe(
      'Votre historique est déjà à jour.',
    )
  })
})

describe('messages génériques', () => {
  it('ne laisse fuir aucun détail sur l’existence du login', () => {
    expect(NOT_FOUND).toBe('Identifiants introuvables.')
    // Le gel PAR LOGIN rend exactement ce texte-là : lui en donner un autre en ferait un signal
    // « ce login est activement ciblé », donc un outil de reconnaissance.
    expect(RATE_LIMITED).toBe('Trop de tentatives. Réessayez dans quelques minutes.')
  })
})
