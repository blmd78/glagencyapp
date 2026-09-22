/**
 * Le TYPE d'un lien de tracking — sa source de trafic.
 *
 * Règle PURE et testée, partagée par l'ingestion (qui la pose à la création d'un lien) et par
 * l'app (qui affiche les groupes). Elle vivait dans `apps/ingestion/src/marketing.ts`, où aucun
 * test ne pouvait l'atteindre : l'ingestion n'a pas de runner.
 *
 * Elle ne s'applique QU'À LA CRÉATION d'un lien : un type corrigé à la main dans l'écran Liens
 * n'est jamais réécrasé par un scrape suivant.
 */

export const LINK_TYPES = [
  'twitter',
  'instagram',
  'telegram',
  'snapchat',
  'tiktok',
  'tiktok_ads',
  'fb_ads',
  'seo',
  'other',
] as const

export type LinkType = (typeof LINK_TYPES)[number]

// Portage des règles du scraper Python, complété le 2026-09-22 (Snapchat, TikTok, TikTok Ads,
// Facebook Ads, SEO — demande Benoit).
const SNAP_RE = /(^|[_\s.-])snap/i
const TIKTOK_RE = /tiktok/i
// Un marqueur de PUB à côté de « tiktok ». « Campagne_tiktok_farm_alice » n'en porte pas : le
// mot « farm » dit la farm de comptes, donc de l'organique — arbitré avec Benoit, et de toute
// façon reclassable en un clic sur la ligne.
const ADS_RE = /(^|[_\s.-])(ads?|paid|sponsor\w*)($|[_\s.-]|\d)/i
const FB_ADS_RE = /fb[_\s.-]?ads|facebook/i
// Frontière autour de « seo » : sans elle, n'importe quel pseudo contenant ces trois lettres
// (« seonyu ») atterrirait dans le groupe SEO.
const SEO_RE = /(^|[_\s.-])seo($|[_\s.-]|\d)/i
const TG_RE = /_tg($|_)|telegram|^tel[a-z]/i
const OTHER_RE = /trafficstar|subs_test/i
const TW_RE = /twitter|^tw[a-z_]|^roro|^keller|^ara[a-z]/i
const IG_RE = /insta|threads|(^|[_\s.-])ig($|[_\s.-])/i

/**
 * L'ORDRE est la règle : du plus spécifique au plus général.
 *
 * · Snapchat passe avant TikTok — « SNAP_TIKTOK » est un lien Snap (le premier marqueur du nom
 *   dit d'où vient le trafic).
 * · « TikTok Ads » avant « TikTok » : le second matcherait aussi.
 * · Les règles historiques (Telegram, résiduels connus, Twitter, Instagram) ferment la marche,
 *   inchangées — sauf Instagram, qui reconnaît désormais le préfixe « IG_ » : sept liens
 *   nommés « IG_Alice_Taha », « Story ig »… dormaient dans « Autres ».
 */
export function detectLinkType(name: string): LinkType {
  if (SNAP_RE.test(name)) return 'snapchat'
  if (FB_ADS_RE.test(name)) return 'fb_ads'
  if (SEO_RE.test(name)) return 'seo'
  if (TIKTOK_RE.test(name)) return ADS_RE.test(name) ? 'tiktok_ads' : 'tiktok'
  if (TG_RE.test(name)) return 'telegram'
  if (OTHER_RE.test(name)) return 'other'
  if (TW_RE.test(name)) return 'twitter'
  if (IG_RE.test(name)) return 'instagram'
  return 'other'
}
