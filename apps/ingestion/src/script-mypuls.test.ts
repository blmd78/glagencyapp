import { describe, expect, it } from 'vitest'
import { parseArgs, resolveCreator } from './script-mypuls'

describe('parseArgs', () => {
  it('lien Notion + modèle, rapport par défaut', () => {
    expect(parseArgs(['https://app.notion.com/p/3ec9f2489f8f81fc8ffee67ca207d695', '--modele=Emma'])).toEqual({
      source: 'https://app.notion.com/p/3ec9f2489f8f81fc8ffee67ca207d695',
      fichier: null,
      modele: 'Emma',
      envoyer: false,
    })
  })
  it('fichier local et --envoyer', () => {
    expect(parseArgs(['--fichier=raw/emma.md', '--modele=Emma', '--envoyer'])).toEqual({
      source: null,
      fichier: 'raw/emma.md',
      modele: 'Emma',
      envoyer: true,
    })
  })
  it('refuse sans modèle, sans source, ou avec deux sources', () => {
    expect(() => parseArgs(['https://x/3ec9f2489f8f81fc8ffee67ca207d695'])).toThrow('--modele=<prénom> manquant')
    expect(() => parseArgs(['--modele=Emma'])).toThrow('lien de la page Notion ou --fichier=<chemin> manquant')
    expect(() => parseArgs(['https://x/3ec9f2489f8f81fc8ffee67ca207d695', '--fichier=a.md', '--modele=Emma'])).toThrow(
      'un lien Notion OU --fichier, pas les deux',
    )
  })
})

describe('resolveCreator', () => {
  const rows = [
    { name: 'Emma', mypuls_creator_id: '290' },
    { name: 'Léa', mypuls_creator_id: '1004' },
    { name: 'Julie', mypuls_creator_id: null },
    { name: 'Sarah', mypuls_creator_id: '11' },
    { name: 'sarah', mypuls_creator_id: '12' },
  ]
  it('trouve sans tenir compte des accents ni de la casse', () => {
    expect(resolveCreator(rows, 'emma')).toEqual({ name: 'Emma', mypulsId: '290' })
    expect(resolveCreator(rows, 'LEA')).toEqual({ name: 'Léa', mypulsId: '1004' })
  })
  it('refuse inconnue, sans id MyPuls, ou ambiguë', () => {
    expect(() => resolveCreator(rows, 'Zoé')).toThrow('modèle « Zoé » introuvable')
    expect(() => resolveCreator(rows, 'Julie')).toThrow('« Julie » n’a pas d’id MyPuls')
    expect(() => resolveCreator(rows, 'Sarah')).toThrow('« Sarah » ambigu : Sarah (11), sarah (12)')
  })
})
