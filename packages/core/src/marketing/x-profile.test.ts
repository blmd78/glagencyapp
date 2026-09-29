import { describe, it, expect } from 'vitest'
import {
  capXAccounts,
  chunk,
  isValidXHandle,
  matchXLookup,
  normalizeXHandle,
  parseXHandleList,
  parseXUser,
  tweetDate,
  xDeltas,
  xStatusFromError,
  type XUser,
} from './x-profile'

const EPOCH = 1288834974657n
/** Identifiant Snowflake fabriqué pour une date donnée (inverse exact de tweetDate). */
const idFor = (iso: string) => ((BigInt(Date.parse(iso)) - EPOCH) << 22n).toString()

const user = (over: Partial<XUser> = {}): XUser => ({
  id: '111',
  username: 'Carla_lovy',
  protected: false,
  most_recent_tweet_id: idFor('2026-09-28T21:15:00.000Z'),
  verified_followers_count: '42',
  public_metrics: { followers_count: 1200, following_count: 300, tweet_count: 5400, listed_count: 3 },
  entities: { url: { urls: [{ url: 'https://t.co/abc', expanded_url: 'https://mym.fans/app/t/xyz' }] } },
  name: 'Carla 💋',
  description: 'Ma page privée 👇',
  profile_image_url: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
  created_at: '2024-03-02T10:00:00.000Z',
  verified_type: 'blue',
  withheld: { country_codes: ['DE', 'FR'] },
  ...over,
})

describe('tweetDate', () => {
  it('retrouve la date de création depuis un identifiant Snowflake', () => {
    expect(tweetDate(idFor('2026-09-28T21:15:00.000Z'))).toBe('2026-09-28T21:15:00.000Z')
  })
  it('rend null pour un identifiant illisible', () => {
    expect(tweetDate('abc')).toBeNull()
    expect(tweetDate('')).toBeNull()
  })
})

describe('parseXUser', () => {
  it('lit les métriques, le lien DÉPLOYÉ de la bio et la date du dernier tweet', () => {
    expect(parseXUser(user())).toEqual({
      xUserId: '111',
      username: 'Carla_lovy',
      followers: 1200,
      following: 300,
      verifiedFollowers: 42,
      postsTotal: 5400,
      bioUrl: 'https://mym.fans/app/t/xyz',
      lastPostAt: '2026-09-28T21:15:00.000Z',
      status: 'ok',
      listed: 3,
      name: 'Carla 💋',
      bioText: 'Ma page privée 👇',
      avatarUrl: 'https://pbs.twimg.com/profile_images/1/a_normal.jpg',
      accountCreatedAt: '2024-03-02T10:00:00.000Z',
      verifiedType: 'blue',
      withheldCountries: ['DE', 'FR'],
    })
  })
  it('un compte protégé garde ses chiffres, statut « privé »', () => {
    expect(parseXUser(user({ protected: true })).status).toBe('privé')
  })
  it('sans lien, sans tweet, sans métriques : des null, jamais des zéros', () => {
    const s = parseXUser({ id: '1', username: 'vide' })
    expect(s).toMatchObject({ followers: null, following: null, verifiedFollowers: null, postsTotal: null, bioUrl: null, lastPostAt: null })
  })
  it('profil sans les champs facultatifs : des null — et une bio vide reste une bio vide', () => {
    const s = parseXUser({ id: '1', username: 'vide', description: '' })
    expect(s).toMatchObject({
      listed: null,
      name: null,
      bioText: '',
      avatarUrl: null,
      accountCreatedAt: null,
      verifiedType: null,
      withheldCountries: null,
    })
  })
  it('un compte bridé nulle part : aucune liste de pays', () => {
    expect(parseXUser(user({ withheld: { country_codes: [] } })).withheldCountries).toBeNull()
  })
})

describe('xStatusFromError', () => {
  it('reconnaît une suspension au mot « suspend »', () => {
    expect(xStatusFromError({ title: 'Forbidden', detail: 'User has been suspended: [x].' })).toBe('suspendu')
  })
  it('tout le reste est « introuvable »', () => {
    expect(xStatusFromError({ title: 'Not Found Error', detail: 'Could not find user with usernames: [x].' })).toBe('introuvable')
  })
})

describe('matchXLookup', () => {
  it('un compte RENOMMÉ est retrouvé par son identifiant X', () => {
    const [r] = matchXLookup([{ id: 'a', handle: 'ancien_nom', xUserId: '111' }], [user({ username: 'nouveau_nom' })], [])
    expect(r).toMatchObject({ accountId: 'a', kind: 'found', snapshot: { username: 'nouveau_nom' } })
  })
  it('sans identifiant, le pseudo est comparé sans la casse', () => {
    const [r] = matchXLookup([{ id: 'a', handle: 'carla_LOVY', xUserId: null }], [user()], [])
    expect(r).toMatchObject({ kind: 'found', snapshot: { xUserId: '111' } })
  })
  it('un compte identifié ne se rattache JAMAIS par pseudo', () => {
    const [r] = matchXLookup([{ id: 'a', handle: 'Carla_lovy', xUserId: '999' }], [user()], [])
    expect(r).toMatchObject({ kind: 'missing', status: 'introuvable' })
  })
  it('un compte absent prend le statut de son erreur', () => {
    const [r] = matchXLookup(
      [{ id: 'a', handle: 'banni', xUserId: null }],
      [],
      [{ value: 'banni', detail: 'User has been suspended: [banni].' }],
    )
    expect(r).toEqual({ accountId: 'a', kind: 'missing', status: 'suspendu' })
  })
})

describe('xDeltas', () => {
  const snap = parseXUser(user())
  it('abonnés : variation signée ; tweets : jamais négatifs (tweets supprimés)', () => {
    expect(xDeltas(snap, { followers: 1250, postsTotal: 5500 })).toEqual({ deltaFollowers: -50, posts24h: 0 })
    expect(xDeltas(snap, { followers: 1100, postsTotal: 5390 })).toEqual({ deltaFollowers: 100, posts24h: 10 })
  })
  it('sans relevé précédent : null', () => {
    expect(xDeltas(snap, undefined)).toEqual({ deltaFollowers: null, posts24h: null })
    expect(xDeltas(snap, { followers: null, postsTotal: null })).toEqual({ deltaFollowers: null, posts24h: null })
  })
})

describe('isValidXHandle', () => {
  it('accepte un pseudo valide', () => {
    expect(isValidXHandle('Carla_lovy')).toBe(true)
  })
  it('refuse un pseudo avec @', () => {
    expect(isValidXHandle('@Carla')).toBe(false)
  })
  it('refuse un pseudo avec espace', () => {
    expect(isValidXHandle('carla lovy')).toBe(false)
  })
  it('refuse un pseudo de plus de 15 caractères', () => {
    expect(isValidXHandle('abcdefghijklmnop')).toBe(false)
  })
  it('refuse un pseudo vide', () => {
    expect(isValidXHandle('')).toBe(false)
  })
})

describe('chunk / capXAccounts', () => {
  it('découpe par paquets de 100', () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i))
    expect(chunk(ids, 100).map((c) => c.length)).toEqual([100, 100, 50])
    expect(chunk([], 100)).toEqual([])
  })
  it('coupe au-delà du plafond et dit qui est laissé de côté', () => {
    const r = capXAccounts([1, 2, 3], 2)
    expect(r).toEqual({ kept: [1, 2], dropped: [3] })
  })
})

describe('normalizeXHandle', () => {
  it('garde un pseudo propre tel quel', () => {
    expect(normalizeXHandle('Carla_lovy')).toBe('Carla_lovy')
  })
  it('retire le @, les espaces et un lien x.com / twitter.com', () => {
    expect(normalizeXHandle('  @Carla_lovy ')).toBe('Carla_lovy')
    expect(normalizeXHandle('https://x.com/Carla_lovy')).toBe('Carla_lovy')
    expect(normalizeXHandle('https://www.twitter.com/Carla_lovy/status/123?s=20')).toBe('Carla_lovy')
    expect(normalizeXHandle('x.com/Carla_lovy/')).toBe('Carla_lovy')
  })
  it('rend null pour ce qui ne peut pas être un pseudo X', () => {
    expect(normalizeXHandle('carla lovy')).toBeNull()
    expect(normalizeXHandle('abcdefghijklmnop')).toBeNull()
    expect(normalizeXHandle('https://instagram.com/carla')).toBeNull()
    expect(normalizeXHandle('@')).toBeNull()
  })
})

describe('parseXHandleList', () => {
  it('un pseudo par ligne ; lignes vides ignorées', () => {
    expect(parseXHandleList('Carla_lovy\n\n@lolaa_chic\n')).toEqual({
      handles: ['Carla_lovy', 'lolaa_chic'],
      invalid: [],
    })
  })
  it('accepte aussi virgules et espaces comme séparateurs', () => {
    expect(parseXHandleList('a_1, b_2 c_3').handles).toEqual(['a_1', 'b_2', 'c_3'])
  })
  it('dédoublonne sans la casse, en gardant la première écriture', () => {
    expect(parseXHandleList('Carla_lovy\ncarla_LOVY').handles).toEqual(['Carla_lovy'])
  })
  it('met de côté les entrées invalides, telles que saisies', () => {
    expect(parseXHandleList('ok_1\nbeaucoup_trop_long_pseudo\nhttps://instagram.com/x')).toEqual({
      handles: ['ok_1'],
      invalid: ['beaucoup_trop_long_pseudo', 'https://instagram.com/x'],
    })
  })
})
