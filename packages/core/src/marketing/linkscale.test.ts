import { describe, it, expect } from 'vitest'
import {
  attributeLink,
  foldName,
  kindOf,
  mymClicksOf,
  parseLinkscaleDay,
  planLinkscaleWrite,
  splitNote,
  type LsAccountRef,
  type LsCreatorRef,
} from './linkscale'

const creators: LsCreatorRef[] = [
  { id: 'c-carla', name: 'Carla' },
  { id: 'c-carla-prive', name: 'Carla (privé)' },
  { id: 'c-julie', name: 'Julie' },
  { id: 'c-lena', name: 'Lena' },
  { id: 'c-jade', name: 'Jade' },
  { id: 'c-lucie', name: 'Lucie' },
]
const accounts: LsAccountRef[] = [
  { id: 'a-tardif', handle: 'Julietardifff', creatorId: 'c-julie' },
  { id: 'a-jadot', handle: 'Carla.Jadot', creatorId: 'c-carla' },
  { id: 'a-jul-a', handle: 'juliette_a', creatorId: null },
  { id: 'a-jul-b', handle: 'juliette_b', creatorId: null },
]
const refs = { creators, accounts }

describe('foldName', () => {
  it('retire casse, accents et ponctuation', () => {
    expect(foldName('Léna')).toBe('lena')
    expect(foldName('Carla.Jadot')).toBe('carlajadot')
    expect(foldName('Carla (privé)')).toBe('carlaprive')
  })
})

describe('splitNote', () => {
  it('reconnaît les préfixes collés, espacés, en toutes casses', () => {
    expect(splitNote('TW ARA CARLA')).toEqual({ prefix: 'x', rest: 'ARA CARLA' })
    expect(splitNote('TWJADE')).toEqual({ prefix: 'x', rest: 'JADE' })
    expect(splitNote('Tw JOSE')).toEqual({ prefix: 'x', rest: 'JOSE' })
    expect(splitNote('INLenaMonerro')).toEqual({ prefix: 'instagram', rest: 'LenaMonerro' })
    expect(splitNote('THREADS taprofcarlaoff')).toEqual({ prefix: 'threads', rest: 'taprofcarlaoff' })
  })
  it('ignore les suffixes entre crochets', () => {
    expect(splitNote('INLOLAMONROSE [duplicate]')).toEqual({ prefix: 'instagram', rest: 'LOLAMONROSE' })
  })
  it('laisse une note sans préfixe telle quelle', () => {
    expect(splitNote(' Lucie ')).toEqual({ prefix: null, rest: 'Lucie' })
  })
})

describe('kindOf / mymClicksOf', () => {
  it('traduit le type LinkScale', () => {
    expect(kindOf('l_p')).toBe('landing')
    expect(kindOf('d_l')).toBe('redirect')
    expect(kindOf('shortcut')).toBe('shortcut')
    expect(kindOf(undefined)).toBe('inconnu')
  })
  it('une redirection n’a pas de clics MYM mesurables', () => {
    expect(mymClicksOf('redirect', 12)).toBeNull()
    expect(mymClicksOf('landing', 12)).toBe(12)
    expect(mymClicksOf('inconnu', 0)).toBe(0)
  })
})

describe('parseLinkscaleDay', () => {
  it('rend visiteurs humains, bots et clics vers mym.fans seulement', () => {
    const lines = parseLinkscaleDay({
      trafficByUrls: [
        {
          id: 'l1',
          url: 'carlaprof.live/carla',
          note: ' TW ARA CARLA ',
          human_users: 14,
          bots: 2,
          button_clicks: [
            { url: 'https://mym.fans/app/t/abc', clicks: 7 },
            { url: 'https://example.com', clicks: 3 },
          ],
        },
        { id: 'l2', host: 'heyliiink.com', u: 'sarrah', human_users: 12, bots: 0 },
      ],
    })
    expect(lines).toEqual([
      { lsId: 'l1', url: 'carlaprof.live/carla', note: 'TW ARA CARLA', visitors: 14, bots: 2, mymClicks: 7 },
      { lsId: 'l2', url: 'heyliiink.com/sarrah', note: '', visitors: 12, bots: 0, mymClicks: 0 },
    ])
  })
  it('fusionne les lignes d’un même lien renommé dans la journée (une ligne par URL chez LinkScale)', () => {
    const lines = parseLinkscaleDay({
      trafficByUrls: [
        { id: 'l1', url: 'heyliiink.com/elsaaa', note: 'Tw ARA', human_users: 2, bots: 0, button_clicks: [{ url: 'https://mym.fans/app/t/a', clicks: 1 }] },
        { id: 'l1', url: 'heyliiink.com/elssa', note: 'Tw ARA', human_users: 1, bots: 1, button_clicks: [{ url: 'https://mym.fans/app/t/a', clicks: 2 }] },
      ],
    })
    expect(lines).toEqual([
      { lsId: 'l1', url: 'heyliiink.com/elsaaa', note: 'Tw ARA', visitors: 3, bots: 1, mymClicks: 3 },
    ])
  })
  it('refuse un payload sans trafficByUrls', () => {
    expect(() => parseLinkscaleDay({ success: false })).toThrow(/trafficByUrls/)
  })
})

describe('attributeLink', () => {
  it('le dossier décide de la modèle ; TW JADE désigne l’opérateur, pas la modèle Jade', () => {
    expect(attributeLink({ note: 'TW JADE', folderNames: ['CARLA'], destination: null }, refs)).toEqual({
      creatorId: 'c-carla',
      platform: 'x',
      socialAccountId: null,
      operator: 'JADE',
    })
  })
  it('sans dossier, TW JADE reste sans modèle', () => {
    expect(attributeLink({ note: 'TW JADE', folderNames: [], destination: null }, refs).creatorId).toBeNull()
  })
  it('le prénom après l’opérateur donne la modèle', () => {
    const a = attributeLink({ note: 'TW RORO LENA', folderNames: [], destination: null }, refs)
    expect(a).toMatchObject({ creatorId: 'c-lena', operator: 'RORO', platform: 'x' })
  })
  it('Instagram : retrouve le compte au pseudo presque identique, et sa modèle', () => {
    const a = attributeLink({ note: 'IN JULIETARDIFF', folderNames: [], destination: null }, refs)
    expect(a).toEqual({ creatorId: 'c-julie', platform: 'instagram', socialAccountId: 'a-tardif', operator: null })
  })
  it('Instagram : deux comptes candidats = aucun compte', () => {
    const a = attributeLink({ note: 'IN juliette', folderNames: [], destination: null }, refs)
    expect(a.socialAccountId).toBeNull()
  })
  it('Snap : la destination donne le réseau, la note seule la modèle (accents ignorés)', () => {
    expect(
      attributeLink({ note: 'Léna', folderNames: ['TEST SNAP TWITTER'], destination: 'https://snapchat.com/t/x' }, refs),
    ).toEqual({ creatorId: 'c-lena', platform: 'snapchat', socialAccountId: null, operator: null })
  })
  it('un dossier au nom voisin ne vaut pas une modèle', () => {
    expect(attributeLink({ note: '', folderNames: ['julie cmo ig'], destination: null }, refs).creatorId).toBeNull()
    expect(attributeLink({ note: '', folderNames: ['CARLA'], destination: null }, refs).creatorId).toBe('c-carla')
  })
  it('sans rien de reconnaissable : réseau autre, rien d’attribué', () => {
    expect(attributeLink({ note: 'JULIE ferrier', folderNames: [], destination: null }, refs)).toEqual({
      creatorId: null,
      platform: 'autre',
      socialAccountId: null,
      operator: null,
    })
  })
})

describe('planLinkscaleWrite', () => {
  const base = {
    folderNames: { f1: 'CARLA' } as Record<string, string>,
    creators,
    accounts,
  }

  it('écrit les liens listés ET ceux vus seulement dans les stats', () => {
    const plan = planLinkscaleWrite({
      ...base,
      days: [
        {
          date: '2026-09-28',
          lines: [
            { lsId: 'lp', url: 'carlaprof.live/carla', note: 'TW ARA CARLA', visitors: 10, bots: 1, mymClicks: 6 },
            { lsId: 'gone', url: 'heyliiink.com/alicee', note: '', visitors: 4, bots: 0, mymClicks: 2 },
          ],
        },
        {
          date: '2026-09-29',
          lines: [{ lsId: 'dl', url: 'heyliiink.com/saraah', note: 'Tw JOSE', visitors: 3, bots: 0, mymClicks: 0 }],
        },
      ],
      listed: [
        { _id: 'lp', t: 'l_p', domain: 'carlaprof.live', u: 'carla', folders: ['f1'] },
        { _id: 'dl', t: 'd_l', domain: 'heyliiink.com', u: 'saraah', url: 'https://mym.fans/app/t/h1' },
      ],
      known: [],
    })
    const byId = new Map(plan.links.map((l) => [l.ls_id, l]))
    expect(byId.get('lp')).toMatchObject({
      kind: 'landing',
      folders: ['CARLA'],
      creator_id: 'c-carla',
      platform: 'x',
      operator: 'ARA',
      manual: false,
      first_seen: '2026-09-28',
      last_seen: '2026-09-28',
    })
    expect(byId.get('gone')).toMatchObject({ kind: 'inconnu', url: 'heyliiink.com/alicee', destination: null })
    expect(byId.get('dl')).toMatchObject({ kind: 'redirect', destination: 'https://mym.fans/app/t/h1' })
    expect(plan.daily).toEqual([
      { lsId: 'lp', date: '2026-09-28', visitors: 10, bots: 1, mym_clicks: 6 },
      { lsId: 'gone', date: '2026-09-28', visitors: 4, bots: 0, mym_clicks: 2 },
      { lsId: 'dl', date: '2026-09-29', visitors: 3, bots: 0, mym_clicks: null },
    ])
  })

  it('un lien connu puis supprimé côté LinkScale garde sa note, son dossier, son type et son attribution', () => {
    const plan = planLinkscaleWrite({
      ...base,
      days: [{ date: '2026-09-29', lines: [{ lsId: 'old', url: 'heyliiink.com/sarrah', note: '', visitors: 20, bots: 0, mymClicks: 5 }] }],
      listed: [],
      known: [
        {
          lsId: 'old',
          manual: false,
          creatorId: 'c-carla',
          platform: 'x',
          socialAccountId: null,
          operator: 'ARA',
          firstSeen: '2026-07-01',
          lastSeen: '2026-09-28',
          url: 'heyliiink.com/sarrah',
          note: 'TW ARA',
          folders: ['CARLA'],
          kind: 'landing',
          destination: null,
        },
      ],
    })
    expect(plan.links[0]).toMatchObject({
      note: 'TW ARA',
      folders: ['CARLA'],
      kind: 'landing',
      creator_id: 'c-carla',
      platform: 'x',
      operator: 'ARA',
      first_seen: '2026-07-01',
      last_seen: '2026-09-29',
    })
    expect(plan.daily[0]!.mym_clicks).toBe(5)
  })

  it('un lien renommé prend son URL actuelle (celle de la liste), pas l’ancienne des stats', () => {
    const plan = planLinkscaleWrite({
      ...base,
      days: [{ date: '2026-09-28', lines: [{ lsId: 'r', url: 'heyliiink.com/elsaaa', note: 'Tw ARA', visitors: 3, bots: 1, mymClicks: 0 }] }],
      listed: [{ _id: 'r', t: 'l_p', domain: 'heyliiink.com', u: 'elssa' }],
      known: [],
    })
    expect(plan.links[0]!.url).toBe('heyliiink.com/elssa')
  })

  it('ne touche jamais à l’attribution d’un lien corrigé à la main', () => {
    const plan = planLinkscaleWrite({
      ...base,
      days: [{ date: '2026-09-29', lines: [{ lsId: 'lp', url: 'x/y', note: 'TW ARA CARLA', visitors: 1, bots: 0, mymClicks: 0 }] }],
      listed: [{ _id: 'lp', t: 'l_p', folders: ['f1'] }],
      known: [
        {
          lsId: 'lp',
          manual: true,
          creatorId: 'c-jade',
          platform: 'instagram',
          socialAccountId: 'a-jadot',
          operator: null,
          firstSeen: '2026-05-02',
          lastSeen: '2026-09-01',
          url: 'x/y',
          note: 'TW ARA CARLA',
          folders: ['CARLA'],
          kind: 'landing',
          destination: null,
        },
      ],
    })
    expect(plan.links[0]).toMatchObject({
      creator_id: 'c-jade',
      platform: 'instagram',
      social_account_id: 'a-jadot',
      operator: null,
      manual: true,
      first_seen: '2026-05-02',
      last_seen: '2026-09-29',
    })
  })
})
