import { describe, expect, it } from 'vitest'
import { detectLinkType } from './link-type'

describe('detectLinkType', () => {
  it('reconnaît Snapchat sous toutes ses casses', () => {
    for (const n of ['snap', 'Snap', 'SNAP', 'SNAP_HAPPN', 'SNAP_BUMBLE']) {
      expect(detectLinkType(n)).toBe('snapchat')
    }
  })

  it('donne « SNAP_TIKTOK » à Snapchat : le premier marqueur dit d où vient le trafic', () => {
    expect(detectLinkType('SNAP_TIKTOK')).toBe('snapchat')
  })

  it('sépare TikTok organique et TikTok Ads', () => {
    expect(detectLinkType('funnel_tiktok')).toBe('tiktok')
    expect(detectLinkType('salve2tiktok')).toBe('tiktok')
    // « farm » = la farm de comptes, pas une campagne payée (arbitré avec Benoit 2026-09-22).
    expect(detectLinkType('Campagne_tiktok_farm_alice')).toBe('tiktok')
    expect(detectLinkType('tiktok_ads_lucie')).toBe('tiktok_ads')
    expect(detectLinkType('TIKTOK ADS 09')).toBe('tiktok_ads')
  })

  it('reconnaît Facebook Ads, collé ou séparé', () => {
    expect(detectLinkType('Malik_fb_ads')).toBe('fb_ads')
    expect(detectLinkType('MalikFBAds')).toBe('fb_ads')
  })

  it('ne prend pour du SEO que le mot entier', () => {
    expect(detectLinkType('CLEM_SEO')).toBe('seo')
    expect(detectLinkType('seo_2')).toBe('seo')
    // Sans frontière, n importe quel pseudo contenant ces trois lettres tomberait dans SEO.
    expect(detectLinkType('seonyu')).not.toBe('seo')
  })

  it('récupère les liens Instagram nommés « IG_ », qui dormaient dans Autres', () => {
    expect(detectLinkType('IG_Alice_Taha')).toBe('instagram')
    expect(detectLinkType('Story ig')).toBe('instagram')
    expect(detectLinkType('ig maprofcarla')).toBe('instagram')
    expect(detectLinkType('profcarla.2025 ig')).toBe('instagram')
  })

  it('garde les classements historiques', () => {
    expect(detectLinkType('CLEMENT_TG')).toBe('telegram')
    expect(detectLinkType('telegram_lucie')).toBe('telegram')
    expect(detectLinkType('twitter_carla')).toBe('twitter')
    expect(detectLinkType('insta_sarah')).toBe('instagram')
    expect(detectLinkType('trafficstars1')).toBe('other')
    expect(detectLinkType('SUBS_TEST_TRACKING')).toBe('other')
  })

  it('range dans Autres un nom qui ne dit rien de sa plateforme', () => {
    // ~37 liens de la prod sont dans ce cas : un pseudo, aucun indice de source.
    expect(detectLinkType('Alicedasilvaa')).toBe('other')
    expect(detectLinkType('Carlaloliie')).toBe('other')
  })
})
