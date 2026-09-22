/**
 * Le rangement d'un lien de tracking dans son GROUPE.
 *
 * Les groupes ne sont plus une union figée dans le code : ce sont des lignes
 * (`mkt_link_groups`, 0167), chacune avec son motif. La règle ci-dessous est donc PARAMÉTRÉE —
 * elle reçoit les groupes, elle n'en connaît aucun. Ajouter « Reddit » ne demande plus de
 * déploiement.
 *
 * Elle ne s'applique qu'à la CRÉATION d'un lien : un lien déplacé à la main ne repart jamais.
 */

export interface LinkGroupRule {
  key: string
  /** Motif lisible par Postgres (`~*`) ET par JS. Vide = jamais détecté automatiquement. */
  pattern: string
  /** Ordre d'évaluation, croissant : le plus spécifique gagne. */
  priority: number
  /** Le groupe de repli — au plus un. */
  isFallback?: boolean
}

/** La clé de repli, quand aucun motif ne reconnaît le nom (et qu'aucun groupe ne se déclare). */
export const FALLBACK_KEY = 'other'

/**
 * Le groupe d'un lien d'après son nom.
 *
 * Premier motif qui reconnaît le nom, dans l'ordre des priorités — c'est ce qui fait que
 * « SNAP_TIKTOK » est un lien Snap (priorité 10) et non TikTok (50).
 *
 * Un motif ILLISIBLE est ignoré plutôt que fatal : ces motifs se saisissent dans l'écran
 * d'admin, et une parenthèse oubliée ne doit pas faire tomber le scrape de la nuit.
 */
export function detectLinkGroup(name: string, groups: readonly LinkGroupRule[]): string {
  const fallback = groups.find((g) => g.isFallback)?.key ?? FALLBACK_KEY
  const candidats = groups
    .filter((g) => !g.isFallback && g.pattern.trim() !== '')
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))
  for (const g of candidats) {
    let re: RegExp
    try {
      re = new RegExp(g.pattern, 'i')
    } catch {
      continue
    }
    if (re.test(name)) return g.key
  }
  return fallback
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
): { key: string; label: string; pattern: string; count: number }[] {
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
      // Le motif reprend la forme qui a servi à le repérer : préfixe + séparateur.
      pattern: `^${key}[_\\s.-]`,
      count: v.n,
    }))
}
