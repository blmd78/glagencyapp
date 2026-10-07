/**
 * Liens SFS (shoutout for shoutout) : du trafic échangé avec d'autres créatrices, pas du trafic
 * externe à proprement parler — il fausserait les stats de l'Overview et de Modèles. Ces liens
 * ont leur propre onglet (Marketing › SFS) et sortent des deux autres pages (décision Benoit,
 * 2026-10-07). Liens tracking les garde : c'est là qu'on range un lien à la main.
 *
 * Un lien est SFS quand il appartient au groupe de clé `sfs` (`mkt_links.type`, 0167) — créé dans
 * Marketing › Liens › Groupes, reconnu par ses mots (« sfs »), épinglable lien par lien.
 * Partagé par marketing-dashboard et marketing-modeles, d'où sa place dans `lib/`.
 */
export const SFS_GROUP_KEY = 'sfs'

/** `externe` : tout sauf les SFS (Overview, Modèles) · `sfs` : les SFS seuls (onglet SFS). */
export type MktScope = 'externe' | 'sfs'

/** Ids des liens SFS parmi `links`. */
export function sfsLinkIds(links: readonly { id: string; type: string }[]): Set<string> {
  return new Set(links.filter((l) => l.type === SFS_GROUP_KEY).map((l) => l.id))
}

/** Les éléments de `items` qui appartiennent au périmètre, d'après l'id de leur lien. */
export function inScope<T>(items: readonly T[], linkId: (item: T) => string, sfsIds: Set<string>, scope: MktScope): T[] {
  return items.filter((it) => sfsIds.has(linkId(it)) === (scope === 'sfs'))
}
