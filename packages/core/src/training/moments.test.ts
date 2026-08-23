import { describe, expect, it } from 'vitest'
import { matchMomentIndex, normalizeCite } from './moments'

describe('normalizeCite', () => {
  it('met en minuscules, écrase les espaces et rogne', () => {
    expect(normalizeCite('  Salut   TOI\n ')).toBe('salut toi')
  })
  it('accepte une entrée vide', () => {
    expect(normalizeCite('')).toBe('')
  })
})

describe('matchMomentIndex', () => {
  const cites = ['tu fais quoi ce soir', 'ça te dit un truc']

  it('apparie une citation identique', () => {
    expect(matchMomentIndex('Tu fais quoi ce soir', cites)).toBe(0)
  })
  it('apparie quand la citation est un EXTRAIT du message', () => {
    expect(matchMomentIndex('Dis-moi, tu fais quoi ce soir ?', cites)).toBe(0)
  })
  it('apparie quand le message est un extrait de la citation', () => {
    expect(matchMomentIndex('ça te dit', cites)).toBe(1)
  })
  it('rend null quand rien ne correspond', () => {
    expect(matchMomentIndex('bonne nuit à toi', cites)).toBeNull()
  })
  it('rend null sur un message trop court pour être discriminant', () => {
    expect(matchMomentIndex('ok', cites)).toBeNull()
  })
  it('ignore une citation trop courte plutôt que de tout apparier', () => {
    expect(matchMomentIndex('un message normal', ['a'])).toBeNull()
  })
  it('prend le PREMIER moment en cas d’égalité', () => {
    expect(matchMomentIndex('salut', ['salut', 'salut'])).toBe(0)
  })
})
