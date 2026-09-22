import { describe, expect, it } from 'vitest'
import { detectLinkGroup, suggestLinkGroups } from './link-group'

const GROUPES = [
  { key: 'snapchat', pattern: '(^|[_ .-])snap', priority: 10 },
  { key: 'fb_ads', pattern: 'fb[_ .-]?ads|facebook', priority: 20 },
  { key: 'seo', pattern: '(^|[_ .-])seo($|[_ .-]|[0-9])', priority: 30 },
  { key: 'tiktok_ads', pattern: 'tiktok[_ .-]?ads|ads[_ .-]?tiktok', priority: 40 },
  { key: 'tiktok', pattern: 'tiktok', priority: 50 },
  { key: 'instagram', pattern: 'insta|threads|(^|[_ .-])ig($|[_ .-])', priority: 90 },
  { key: 'other', pattern: '', priority: 999, isFallback: true },
]

describe('detectLinkGroup', () => {
  it('range par ORDRE DE PRIORITÉ, pas par ordre de liste', () => {
    // « SNAP_TIKTOK » reconnaît deux motifs : c’est la priorité qui tranche.
    expect(detectLinkGroup('SNAP_TIKTOK', GROUPES)).toBe('snapchat')
    expect(detectLinkGroup('tiktok_ads_lucie', GROUPES)).toBe('tiktok_ads')
    expect(detectLinkGroup('funnel_tiktok', GROUPES)).toBe('tiktok')
  })

  it('tombe dans le groupe de repli quand aucun motif ne reconnaît le nom', () => {
    expect(detectLinkGroup('Alicedasilvaa', GROUPES)).toBe('other')
  })

  it('utilise « other » si aucun groupe ne se déclare de repli', () => {
    expect(detectLinkGroup('inconnu', [{ key: 'tiktok', pattern: 'tiktok', priority: 1 }])).toBe('other')
  })

  it('ignore un motif illisible plutôt que de faire tomber le scrape', () => {
    // Une parenthèse oubliée dans l'écran d'admin ne doit pas coûter la nuit d'ingestion.
    const casse = [{ key: 'casse', pattern: '(tiktok', priority: 1 }, ...GROUPES]
    expect(detectLinkGroup('funnel_tiktok', casse)).toBe('tiktok')
  })

  it('ne détecte jamais un groupe au motif vide', () => {
    const vide = [{ key: 'manuel', pattern: '   ', priority: 1 }, ...GROUPES]
    expect(detectLinkGroup('nimporte quoi', vide)).toBe('other')
  })
})

describe('suggestLinkGroups', () => {
  it('repère un préfixe récurrent et en propose un groupe', () => {
    const noms = ['REDDIT_alice', 'REDDIT_carla', 'REDDIT_lena', 'Alicedasilvaa']
    expect(suggestLinkGroups(noms, [])).toEqual([
      { key: 'reddit', label: 'REDDIT', pattern: '^reddit[_\\s.-]', count: 3 },
    ])
  })

  it('exige un SÉPARATEUR : sinon chaque pseudo deviendrait son propre groupe', () => {
    // Le vrai cas de la prod : six liens « Alice… » qui ne partagent aucun motif exploitable.
    const noms = ['Alicedasilvaa', 'Alicedayann', 'Alicegabii', 'Alicelorraine']
    expect(suggestLinkGroups(noms, [])).toEqual([])
  })

  it('ne propose pas un groupe déjà connu — y compris supprimé', () => {
    const noms = ['CRM-un', 'CRM-deux', 'CRM-trois']
    expect(suggestLinkGroups(noms, ['crm'])).toEqual([])
  })

  it('ne parle de motif qu au-delà du seuil', () => {
    expect(suggestLinkGroups(['SFS_lucie', 'SFS_test'], [])).toEqual([])
    expect(suggestLinkGroups(['SFS_lucie', 'SFS_test'], [], 2)).toHaveLength(1)
  })
})
