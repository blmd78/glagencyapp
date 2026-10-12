import { describe, expect, it } from 'vitest'
import { NotionError } from '@glagency/scripts/notion'
import { firstWorkspaceWithPage } from './notion-pages'

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
