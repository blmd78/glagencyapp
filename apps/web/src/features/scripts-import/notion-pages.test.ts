import { describe, expect, it } from 'vitest'
import { NotionError } from '@glagency/scripts/notion'
import { firstWorkspaceWithPage, organizeNotionPages } from './notion-pages'

const creators = [
  { id: 'c-emma', name: 'Emma' },
  { id: 'c-lucie', name: 'Lucie' },
  { id: 'c-julie', name: 'Julie' },
  { id: 'c-julie-p', name: 'Julie (privé)' },
]

describe('firstWorkspaceWithPage', () => {
  it('lien collé : essaie chaque espace connecté, ignore « introuvable / non partagé », garde le premier qui répond', async () => {
    const tried: string[] = []
    const read = async (id: string) => {
      tried.push(id)
      if (id === 'w1') throw new NotionError(404, 'x')
      if (id === 'w2') throw new NotionError(403, 'x')
      return { title: 'KYC' }
    }
    expect(await firstWorkspaceWithPage(['w1', 'w2', 'w3', 'w4'], read)).toEqual({ id: 'w3', value: { title: 'KYC' } })
    expect(tried).toEqual(['w1', 'w2', 'w3'])
  })
  it('un espace en panne (clé expirée, Notion 500) n’empêche pas de trouver la page dans un espace suivant', async () => {
    const read = async (id: string) => {
      if (id === 'w1') throw new NotionError(401, 'clé')
      return { title: 'KYC' }
    }
    expect(await firstWorkspaceWithPage(['w1', 'w2'], read)).toEqual({ id: 'w2', value: { title: 'KYC' } })
  })
  it('introuvable partout → null ; si un espace a échoué autrement, SA première erreur remonte (pas un faux « introuvable »)', async () => {
    expect(await firstWorkspaceWithPage(['w1'], async () => Promise.reject(new NotionError(404, 'x')))).toBeNull()
    expect(await firstWorkspaceWithPage([], async () => ({}))).toBeNull()
    const read = async (id: string) => {
      if (id === 'w1') throw new NotionError(401, 'clé')
      throw new NotionError(404, 'x')
    }
    const err = await firstWorkspaceWithPage(['w1', 'w2'], read).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NotionError)
    expect((err as NotionError).status).toBe(401)
  })
})

describe('organizeNotionPages', () => {
  it('modèle reconnue par le DOSSIER parent direct (EMMA = Emma), où que soit ce dossier', () => {
    const r = organizeNotionPages(
      [
        { id: 'root', title: 'SCRIPTS MYPULS', parentId: null },
        { id: 'f-emma', title: 'EMMA', parentId: 'root' },
        { id: 's1', title: 'Script de vente V3', parentId: 'f-emma' },
        { id: 's2', title: 'KYC', parentId: 'f-emma' },
      ],
      creators,
    )
    expect(r.recognized).toEqual([
      {
        id: 'modele:c-emma',
        title: 'Emma',
        creatorId: 'c-emma',
        scripts: [
          { id: 's2', title: 'KYC' },
          { id: 's1', title: 'Script de vente V3' },
        ],
      },
    ])
  })

  it('sinon par la FIN DU TITRE (« … · Lucie ») — le cas d’OUTILS MANAGERS', () => {
    const r = organizeNotionPages(
      [
        { id: 'om', title: 'OUTILS MANAGERS', parentId: null },
        { id: 'k', title: 'Script découverte (KYC) · Lucie', parentId: 'om' },
        { id: 'v', title: 'Script de vente · Julie (privé)', parentId: 'om' },
      ],
      creators,
    )
    expect(r.recognized.map((g) => [g.creatorId, g.scripts.map((s) => s.id)])).toEqual([
      ['c-julie-p', ['v']],
      ['c-lucie', ['k']],
    ])
  })

  it('le reste dans « autres », groupé par dossier parent ; un dossier de modèle n’est pas pris pour un script', () => {
    const r = organizeNotionPages(
      [
        { id: 'om', title: 'OUTILS MANAGERS', parentId: null },
        { id: 'p1', title: 'Prompt – Script de vente V3', parentId: 'om' },
        { id: 'f-emma', title: 'EMMA', parentId: null },
        { id: 'm1', title: 'Photo 1', parentId: 'k' },
        { id: 'k', title: 'Script découverte (KYC) · Lucie', parentId: 'om' },
      ],
      creators,
    )
    expect(r.recognized.map((g) => g.creatorId)).toEqual(['c-lucie'])
    expect(r.others).toEqual([
      { id: 'parent:om', title: 'OUTILS MANAGERS', creatorId: null, scripts: [{ id: 'p1', title: 'Prompt – Script de vente V3' }] },
      { id: 'parent:k', title: 'Script découverte (KYC) · Lucie', creatorId: null, scripts: [{ id: 'm1', title: 'Photo 1' }] },
      {
        id: 'parent:',
        title: 'Sans dossier',
        creatorId: null,
        scripts: [
          { id: 'f-emma', title: 'EMMA' },
          { id: 'om', title: 'OUTILS MANAGERS' },
        ],
      },
    ])
  })

  const recognizedIds = (r: ReturnType<typeof organizeNotionPages>) => r.recognized.map((g) => [g.creatorId, g.scripts.map((s) => s.id)])

  it('titre : prénom n’importe où, quel que soit le séparateur', () => {
    const r = organizeNotionPages(
      [
        { id: 'a', title: 'Script KYC - Lucie', parentId: null },
        { id: 'b', title: 'Script Lucie relance', parentId: null },
        { id: 'c', title: '🔥 Relance (EMMA)', parentId: null },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-emma', ['c']],
      ['c-lucie', ['a', 'b']],
    ])
  })

  it('dossier : nom de la modèle entouré de mots génériques (« Scripts Emma », « 📁 Lucie – script »)', () => {
    const r = organizeNotionPages(
      [
        { id: 'fe', title: 'Scripts Emma', parentId: null },
        { id: 'fl', title: '📁 Lucie – script', parentId: null },
        { id: 's1', title: 'KYC', parentId: 'fe' },
        { id: 's2', title: 'Vente V3', parentId: 'fl' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-emma', ['s1']],
      ['c-lucie', ['s2']],
    ])
    expect(r.others.flatMap((g) => g.scripts.map((s) => s.id)).sort()).toEqual(['fe', 'fl'])
  })

  it('sous-dossier générique traversé (EMMA › Scripts › KYC) ; le dossier « Scripts » n’est pas un script', () => {
    const r = organizeNotionPages(
      [
        { id: 'fe', title: 'EMMA', parentId: null },
        { id: 'gen', title: 'Scripts', parentId: 'fe' },
        { id: 'k', title: 'KYC', parentId: 'gen' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([['c-emma', ['k']]])
    expect(r.others.flatMap((g) => g.scripts.map((s) => s.id)).sort()).toEqual(['fe', 'gen'])
  })

  it('sous-dossier NON générique : pas traversé (EMMA › Ventes › KYC reste dans « autres »)', () => {
    const r = organizeNotionPages(
      [
        { id: 'fe', title: 'EMMA', parentId: null },
        { id: 'v', title: 'Ventes', parentId: 'fe' },
        { id: 'k', title: 'KYC', parentId: 'v' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([['c-emma', ['v']]])
  })

  it('une sous-page d’un script (média) n’est jamais un script, même si elle porte le prénom', () => {
    const r = organizeNotionPages(
      [
        { id: 'fl', title: 'LUCIE', parentId: null },
        { id: 'k', title: 'Script Lucie KYC', parentId: 'fl' },
        { id: 'm1', title: 'Photo 1', parentId: 'k' },
        { id: 'm2', title: 'Photo Lucie 2', parentId: 'k' },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([['c-lucie', ['k']]])
    expect(r.others.find((g) => g.id === 'parent:k')?.scripts.map((s) => s.id)).toEqual(['m1', 'm2'])
  })

  it('prénom en minuscule = mot courant, ignoré (« Relance claire » ≠ Claire) ; « · claire » en fin de titre reste reconnu', () => {
    const withClaire = [...creators, { id: 'c-claire', name: 'Claire' }]
    const r = organizeNotionPages(
      [
        { id: 'a', title: 'Relance claire et directe', parentId: null },
        { id: 'b', title: 'Script KYC · claire', parentId: null },
      ],
      withClaire,
    )
    expect(recognizedIds(r)).toEqual([['c-claire', ['b']]])
  })

  it('le nom le plus précis l’emporte (« Julie (privé) » sur Julie) ; Juliette n’est pas Julie', () => {
    const r = organizeNotionPages(
      [
        { id: 'a', title: 'Script vente Julie (privé)', parentId: null },
        { id: 'b', title: 'Script vente Juliette', parentId: null },
        { id: 'c', title: 'Script vente Julie', parentId: null },
      ],
      creators,
    )
    expect(recognizedIds(r)).toEqual([
      ['c-julie', ['c']],
      ['c-julie-p', ['a']],
    ])
  })

  it('deux modèles différentes (titre, ou dossier contre titre) → pas de présélection', () => {
    const r = organizeNotionPages(
      [
        { id: 'a', title: 'Script Emma et Lucie', parentId: null },
        { id: 'fe', title: 'EMMA', parentId: null },
        { id: 'b', title: 'KYC · Lucie', parentId: 'fe' },
      ],
      creators,
    )
    expect(r.recognized).toEqual([])
  })

  it('deux modèles du même nom → pas de présélection', () => {
    const twins = [...creators, { id: 'c-emma-2', name: 'Emma' }]
    const r = organizeNotionPages([{ id: 'a', title: 'KYC Emma', parentId: null }], twins)
    expect(r.recognized).toEqual([])
  })

  it('page parente non partagée → « Sans dossier » ; titre vide → « Sans titre »', () => {
    const r = organizeNotionPages([{ id: 'x', title: '', parentId: 'inconnue' }], creators)
    expect(r.others).toEqual([{ id: 'parent:', title: 'Sans dossier', creatorId: null, scripts: [{ id: 'x', title: 'Sans titre' }] }])
  })
})
