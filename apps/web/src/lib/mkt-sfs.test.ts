import { describe, expect, it } from 'vitest'
import { SFS_GROUP_KEY, inScope, sfsLinkIds } from './mkt-sfs'

const links = [
  { id: 'a', type: SFS_GROUP_KEY },
  { id: 'b', type: 'snapchat' },
  { id: 'c', type: 'other' },
]
const daily = [
  { link_id: 'a', clicks: 1 },
  { link_id: 'b', clicks: 2 },
  { link_id: 'c', clicks: 3 },
  { link_id: 'a', clicks: 4 },
]

describe('liens SFS', () => {
  it('reconnaît un lien SFS par la clé de son groupe, et rien d’autre', () => {
    expect([...sfsLinkIds(links)]).toEqual(['a'])
    expect(sfsLinkIds([{ id: 'x', type: 'SFS' }]).size).toBe(0)
  })

  it('le périmètre « sfs » ne garde que les SFS, « externe » tout le reste', () => {
    const ids = sfsLinkIds(links)
    expect(inScope(links, (l) => l.id, ids, 'sfs').map((l) => l.id)).toEqual(['a'])
    expect(inScope(links, (l) => l.id, ids, 'externe').map((l) => l.id)).toEqual(['b', 'c'])
  })

  it('les deux périmètres se partagent les lignes journalières sans perte ni doublon', () => {
    const ids = sfsLinkIds(links)
    const sfs = inScope(daily, (d) => d.link_id, ids, 'sfs')
    const ext = inScope(daily, (d) => d.link_id, ids, 'externe')
    expect(sfs.map((d) => d.clicks)).toEqual([1, 4])
    expect(ext.map((d) => d.clicks)).toEqual([2, 3])
    expect(sfs.length + ext.length).toBe(daily.length)
  })

  it('sans groupe SFS, « externe » garde tout et « sfs » est vide', () => {
    const ids = sfsLinkIds([{ id: 'b', type: 'snapchat' }])
    expect(inScope(daily, (d) => d.link_id, ids, 'externe')).toHaveLength(4)
    expect(inScope(daily, (d) => d.link_id, ids, 'sfs')).toHaveLength(0)
  })
})
