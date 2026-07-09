// Normalisation des labels de chatteurs scrapés → clé de rapprochement `chatter_alias`.
// Source unique partagée par le pipeline money-team (pipeline.ts) et le scrape spenders
// (spenders.ts) : les deux DOIVENT résoudre un chatteur avec la même clé, sinon un même
// chatteur se résout différemment selon la page d'origine.
// On NE retire PAS les accents : « José » et « Jose » peuvent être deux personnes distinctes.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
}

/** Décode les entités HTML (numériques + nommées) — le HTML MyPuls en livre parfois (« SOS&#039;GOD »). */
export const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => {
      const cp = parseInt(n, 16)
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m
    })
    .replace(/&#(\d+);/g, (m, n) => {
      const cp = Number(n)
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : m
    })
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)

/** Clé de rapprochement : casse, espaces et symboles retirés (accents conservés). */
export const normLabel = (s: string) =>
  decodeEntities(s)
    .replace(/\s*\(accès révoqué\)\s*$/i, '') // suffixe CSV d'état, pas d'identité
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '') // retire symboles ET espaces : « Mk (Ghost) » ≡ « Mk(Ghost) »
