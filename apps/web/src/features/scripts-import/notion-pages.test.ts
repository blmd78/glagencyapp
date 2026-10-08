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

  it('page parente non partagée → « Sans dossier » ; titre vide → « Sans titre »', () => {
    const r = organizeNotionPages([{ id: 'x', title: '', parentId: 'inconnue' }], creators)
    expect(r.others).toEqual([{ id: 'parent:', title: 'Sans dossier', creatorId: null, scripts: [{ id: 'x', title: 'Sans titre' }] }])
  })
})
