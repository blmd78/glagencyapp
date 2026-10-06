import { describe, expect, it } from 'vitest'
import { resolveIdentities } from './shifts-core'
import { FakeSupabase } from './test/fake-supabase'

// Rapprochement du relevé des shifts : l'id d'abord, puis le nom — sans JAMAIS deviner. Deux comptes
// MyPuls inconnus qui désignent la même fiche par leur libellé ne la reçoivent ni l'un ni l'autre,
// quel que soit l'ordre du CSV.

type Db = Parameters<typeof resolveIdentities>[0]
const chatter = (id: string, display_name: string, mypuls_user_id: string | null = null) => ({
  id,
  display_name,
  email: null,
  mypuls_user_id,
})

async function resolve(chatters: ReturnType<typeof chatter>[], people: [string, string][]) {
  const db = new FakeSupabase({ chatters, chatter_alias: [], profiles: [] })
  const r = await resolveIdentities(db as unknown as Db, new Map(people))
  const sorted = [...r.unmatched].sort((a, b) => a.mypulsUserId.localeCompare(b.mypulsUserId))
  return { db, r, unmatched: sorted, links: db.rows('chatters').filter((c) => c.mypuls_user_id).map((c) => [c.id, c.mypuls_user_id]) }
}

describe('resolveIdentities — deux passes, indépendant de l’ordre', () => {
  it('deux ids inconnus au même libellé, une seule fiche libre : TOUS deux « ambigu », aucun lien posé, dans les deux ordres', async () => {
    const fiches = [chatter('ch-serge', 'Serge')]
    const a = await resolve(fiches, [['9332', 'Serge'], ['10504', 'Serge']])
    const b = await resolve(fiches, [['10504', 'Serge'], ['9332', 'Serge']])

    for (const x of [a, b]) {
      expect(x.unmatched).toEqual([
        { mypulsUserId: '10504', label: 'Serge', raison: 'ambigu' },
        { mypulsUserId: '9332', label: 'Serge', raison: 'ambigu' },
      ])
      expect(x.links).toEqual([])
      expect(x.r.backfilled).toBe(0)
      expect(x.db.writesTo('chatters')).toEqual([])
      expect(x.r.chatterByMypulsId.size).toBe(0)
    }
  })

  it('libellés différents qui se normalisent pareil (« Yann (accès révoqué) » / « yann ») : même règle', async () => {
    const x = await resolve([chatter('ch-yann', 'yann')], [['243', 'Yann (accès révoqué)'], ['1163', 'yann']])
    expect(x.unmatched.map((u) => [u.mypulsUserId, u.raison])).toEqual([
      ['1163', 'ambigu'],
      ['243', 'ambigu'],
    ])
    expect(x.links).toEqual([])
  })

  it('un seul id inconnu vers une fiche libre : lien posé (le cas nominal ne change pas)', async () => {
    const x = await resolve([chatter('ch-serge', 'Serge')], [['10504', 'Serge']])
    expect(x.unmatched).toEqual([])
    expect(x.links).toEqual([['ch-serge', '10504']])
    expect(x.r.backfilled).toBe(1)
    expect(x.r.chatterByMypulsId.get('10504')).toBe('ch-serge')
  })

  it('deux ids inconnus vers deux fiches différentes : chacun reçoit la sienne', async () => {
    const x = await resolve([chatter('ch-a', 'Alain'), chatter('ch-k', 'Kwasi')], [['1', 'Alain'], ['2', 'Kwasi']])
    expect(x.unmatched).toEqual([])
    expect(x.links).toEqual([
      ['ch-a', '1'],
      ['ch-k', '2'],
    ])
  })

  it('un id connu reste rattaché à sa fiche, et ne « dispute » pas la fiche libre homonyme à un id inconnu', async () => {
    const x = await resolve([chatter('ch-s1', 'Serge', '9332'), chatter('ch-s2', 'Serge')], [['9332', 'Serge'], ['10504', 'Serge']])
    expect(x.r.chatterByMypulsId.get('9332')).toBe('ch-s1')
    // « Serge » désigne deux fiches (dont une identifiée) : 10504 reste « ambigu », comme avant.
    expect(x.unmatched).toEqual([{ mypulsUserId: '10504', label: 'Serge', raison: 'ambigu' }])
  })
})
