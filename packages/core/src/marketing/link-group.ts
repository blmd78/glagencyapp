/**
 * Le rangement d'un lien de tracking dans son GROUPE.
 *
 * Les groupes ne sont plus une union figée dans le code : ce sont des lignes
 * (`mkt_link_groups`, 0167), chacune avec ses mots-clés. La règle ci-dessous est donc
 * PARAMÉTRÉE — elle reçoit les groupes, elle n'en connaît aucun. Ajouter « Reddit » ne demande
 * plus de déploiement.
 *
 * Trois façons de reconnaître un nom (0168) — des LISTES de mots, plus des expressions
 * régulières, que personne au pôle marketing ne pouvait relire ni corriger :
 *  · `contains`   — le nom contient le mot (« facebook » dans « Malik_facebook_2 ») ;
 *  · `startsWith` — le nom commence par le mot (« ara » : « AraBella » oui, « Sarahcirre » NON —
 *                   c'est pour ça que « contient » ne suffisait pas) ;
 *  · `words`      — le nom contient le mot ENTIER (« ig » : « IG_Alice » oui, « hotgirl » non ;
 *                   indispensable pour les sigles courts, tg / ig / seo).
 *
 * Tout se compare sans majuscules, sans accents, et SANS SÉPARATEURS pour `contains` et
 * `startsWith` : « Malik_fb_ads » et « MalikFBAds » se lisent pareil, un seul mot-clé
 * « fbads » les reconnaît tous les deux.
 */

export interface LinkGroupRule {
  key: string
  contains: readonly string[]
  startsWith: readonly string[]
  words: readonly string[]
  /** Ordre d'évaluation, croissant : le plus spécifique gagne. */
  priority: number
  /** Le groupe de repli — au plus un. */
  isFallback?: boolean
}

/** La clé de repli, quand aucun groupe ne reconnaît le nom (et qu'aucun ne se déclare repli). */
export const FALLBACK_KEY = 'other'

const SEPARATEURS = /[\s_.\-]+/g

/** Minuscules, sans accents. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * La forme CANONIQUE d'un mot-clé ou d'un nom : minuscules, sans accents, sans séparateurs.
 * Exportée pour que l'écran d'admin enregistre les mots-clés sous la forme même où la règle
 * les compare — sinon « FB Ads » saisi à la main ne reconnaîtrait jamais rien.
 */
export function normalizeKeyword(s: string): string {
  return norm(s).replace(SEPARATEURS, '')
}

/** Les mots du nom : coupés aux séparateurs ET aux frontières lettres/chiffres (« seo2 » → seo, 2). */
function wordsOf(name: string): string[] {
  return norm(name)
    .split(/[\s_.\-]+|(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/)
    .filter(Boolean)
}

/** Ce nom est-il reconnu par ce groupe ? Un mot-clé vide ne reconnaît rien. */
export function matchesLinkGroup(name: string, g: LinkGroupRule): boolean {
  const plat = normalizeKeyword(name)
  const mots = wordsOf(name)
  const ok = (kws: readonly string[], test: (k: string) => boolean) =>
    kws.some((k) => {
      const kk = normalizeKeyword(k)
      return kk !== '' && test(kk)
    })
  return (
    ok(g.contains, (k) => plat.includes(k)) ||
    ok(g.startsWith, (k) => plat.startsWith(k)) ||
    ok(g.words, (k) => mots.includes(k))
  )
}

/**
 * Le groupe d'un lien d'après son nom : le premier qui le reconnaît, dans l'ordre des
 * priorités — c'est ce qui fait que « SNAP_TIKTOK » est un lien Snap (10) et non TikTok (50).
 */
export function detectLinkGroup(name: string, groups: readonly LinkGroupRule[]): string {
  const fallback = groups.find((g) => g.isFallback)?.key ?? FALLBACK_KEY
  const candidats = groups
    .filter((g) => !g.isFallback)
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))
  return candidats.find((g) => matchesLinkGroup(name, g))?.key ?? fallback
}

/**
 * Les motifs RÉCURRENTS que personne n'a encore déclarés — ce que l'ingestion propose en
 * groupe neuf (« créés dynamiquement si besoin »).
 *
 * On ne retient qu'un préfixe ALPHABÉTIQUE d'au moins trois lettres, séparé du reste du nom
 * (`REDDIT_x`, `CRM-y`, `sfs test`) : sans séparateur, « Alicedasilvaa » et « Alicegabii »
 * feraient naître un groupe « alicedasilvaa » par lien, ce qui est pire que pas de groupe. Et
 * il en faut au moins `min` pour qu'on parle d'un motif plutôt que d'un cas isolé.
 *
 * `known` couvre AUSSI les groupes supprimés : un groupe qu'on vient d'écarter ne doit pas
 * renaître au scrape suivant.
 */
export function suggestLinkGroups(
  names: readonly string[],
  known: readonly string[],
  min = 3,
): { key: string; label: string; words: string[]; count: number }[] {
  const deja = new Set(known.map((k) => k.toLowerCase()))
  const compte = new Map<string, { brut: string; n: number }>()
  for (const name of names) {
    const brut = /^([a-zA-Z]{3,})[_\s.-]/.exec(name.trim())?.[1]
    if (!brut) continue
    const key = brut.toLowerCase()
    if (deja.has(key)) continue
    const cur = compte.get(key)
    if (cur) cur.n += 1
    else compte.set(key, { brut, n: 1 })
  }
  return [...compte]
    .filter(([, v]) => v.n >= min)
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .map(([key, v]) => ({
      key,
      // Le libellé garde la casse d'origine — « CRM » et non « crm ». Renommable à l'écran.
      label: v.brut,
      // Repéré comme un MOT en tête de nom : on le reconnaît comme mot entier.
      words: [key],
      count: v.n,
    }))
}
