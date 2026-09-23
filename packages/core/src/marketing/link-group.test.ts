import { describe, expect, it } from 'vitest'
import { detectLinkGroup, matchesLinkGroup, normalizeKeyword, suggestLinkGroups, type LinkGroupRule } from './link-group'

const g = (o: Partial<LinkGroupRule> & { key: string; priority: number }): LinkGroupRule => ({
  contains: [], startsWith: [], words: [], ...o,
})

// Les groupes de la prod, tels que 0168 les convertit.
const GROUPES: LinkGroupRule[] = [
  g({ key: 'snapchat', priority: 10, contains: ['snap'] }),
  g({ key: 'fb_ads', priority: 20, contains: ['fbads', 'facebook'] }),
  g({ key: 'seo', priority: 30, words: ['seo'] }),
  g({ key: 'tiktok_ads', priority: 40, contains: ['tiktokads', 'adstiktok'] }),
  g({ key: 'tiktok', priority: 50, contains: ['tiktok'] }),
  g({ key: 'telegram', priority: 70, contains: ['telegram'], startsWith: ['tel'], words: ['tg'] }),
  g({ key: 'twitter', priority: 80, contains: ['twitter'], startsWith: ['tw', 'roro', 'keller', 'ara'] }),
  g({ key: 'instagram', priority: 90, contains: ['insta', 'threads'], words: ['ig'] }),
  g({ key: 'other', priority: 999, isFallback: true }),
]

describe('detectLinkGroup', () => {
  it('range par ORDRE DE PRIORITÉ, pas par ordre de liste', () => {
    // « SNAP_TIKTOK » est reconnu par deux groupes : c'est la priorité qui tranche.
    expect(detectLinkGroup('SNAP_TIKTOK', GROUPES)).toBe('snapchat')
    expect(detectLinkGroup('tiktok_ads_lucie', GROUPES)).toBe('tiktok_ads')
    expect(detectLinkGroup('funnel_tiktok', GROUPES)).toBe('tiktok')
  })

  it('lit pareil un nom avec ou sans séparateurs', () => {
    expect(detectLinkGroup('Malik_fb_ads', GROUPES)).toBe('fb_ads')
    expect(detectLinkGroup('MalikFBAds', GROUPES)).toBe('fb_ads')
    expect(detectLinkGroup('TIKTOK ADS 09', GROUPES)).toBe('tiktok_ads')
  })

  it('« commence par » ne reconnaît pas le mot au milieu du nom', () => {
    // La raison d'être de ce mode : « ara » en « contient » enverrait Sarah dans Twitter.
    expect(detectLinkGroup('Sarahcirre', GROUPES)).toBe('other')
    expect(detectLinkGroup('AraBella', GROUPES)).toBe('twitter')
  })

  it('« mot entier » protège les sigles courts', () => {
    expect(detectLinkGroup('IG_Alice_Taha', GROUPES)).toBe('instagram')
    expect(detectLinkGroup('Story ig', GROUPES)).toBe('instagram')
    expect(detectLinkGroup('profcarla.2025 ig', GROUPES)).toBe('instagram')
    expect(detectLinkGroup('CLEMENT_TG_V2', GROUPES)).toBe('telegram')
    expect(detectLinkGroup('CLEM_SEO', GROUPES)).toBe('seo')
    expect(detectLinkGroup('seo2', GROUPES)).toBe('seo')
    // Sans la notion de mot, ces trois-là seraient mal rangés.
    expect(detectLinkGroup('seonyu', GROUPES)).toBe('other')
    expect(detectLinkGroup('hotgirl', GROUPES)).toBe('other')
    expect(detectLinkGroup('bigboss', GROUPES)).toBe('other')
  })

  it('tombe dans le repli quand aucun groupe ne reconnaît le nom', () => {
    expect(detectLinkGroup('Alicedasilvaa', GROUPES)).toBe('other')
  })

  it('utilise « other » si aucun groupe ne se déclare de repli', () => {
    expect(detectLinkGroup('inconnu', [g({ key: 'tiktok', priority: 1, contains: ['tiktok'] })])).toBe('other')
  })

  it('ne reconnaît rien avec un mot-clé vide', () => {
    expect(matchesLinkGroup('nimporte', g({ key: 'x', priority: 1, contains: ['  ', '_'] }))).toBe(false)
  })
})

describe('normalizeKeyword', () => {
  it('ramène un mot-clé saisi à la main à la forme comparée', () => {
    expect(normalizeKeyword(' FB Ads ')).toBe('fbads')
    expect(normalizeKeyword('Télégram')).toBe('telegram')
  })
})

describe('suggestLinkGroups', () => {
  it('repère un préfixe récurrent et en propose un groupe', () => {
    const noms = ['REDDIT_alice', 'REDDIT_carla', 'REDDIT_lena', 'Alicedasilvaa']
    expect(suggestLinkGroups(noms, [])).toEqual([{ key: 'reddit', label: 'REDDIT', words: ['reddit'], count: 3 }])
  })

  it('exige un SÉPARATEUR : sinon chaque pseudo deviendrait son propre groupe', () => {
    expect(suggestLinkGroups(['Alicedasilvaa', 'Alicedayann', 'Alicegabii', 'Alicelorraine'], [])).toEqual([])
  })

  it('ne propose pas un groupe déjà connu — y compris supprimé', () => {
    expect(suggestLinkGroups(['CRM-un', 'CRM-deux', 'CRM-trois'], ['crm'])).toEqual([])
  })

  it('ne parle de motif qu au-delà du seuil', () => {
    expect(suggestLinkGroups(['SFS_lucie', 'SFS_test'], [])).toEqual([])
    expect(suggestLinkGroups(['SFS_lucie', 'SFS_test'], [], 2)).toHaveLength(1)
  })
})
