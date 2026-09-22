import type { MktGroup } from '@/lib/types/marketing'

/**
 * La palette des groupes de liens : huit teintes passées au validateur dataviz DANS CET ORDRE
 * (paires adjacentes, ΔE 8,3 au pire sous protanopie, 20,5 en vision normale).
 *
 * Un groupe créé dynamiquement (0167) pioche ici plutôt qu'au hasard : une teinte libre
 * casserait le contrôle daltonisme sans prévenir. Au-delà de huit groupes colorés, les suivants
 * prennent le neutre — une couleur répétée est moins grave qu'une couleur indiscernable, et de
 * toute façon l'anneau ne montre que les quatre premières sources.
 */
export const GROUP_PALETTE = [
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#ca8a04',
  '#059669',
  '#ea580c',
  '#3b82f6',
  '#65a30d',
] as const

export const NEUTRAL_COLOR = 'var(--muted-foreground)'

/**
 * Donne une couleur aux groupes qui n'en ont pas — ceux que l'ingestion vient de créer.
 *
 * Fonction PURE : le repli garde toujours le neutre (c'est la file d'attente, elle ne doit pas
 * attirer l'œil), et les couleurs déjà choisies à la main sont respectées, même si elles
 * doublonnent : on ne repeint pas un groupe dans le dos de qui l'a réglé.
 */
export function withColors(groups: readonly MktGroup[]): MktGroup[] {
  const prises = new Set(groups.map((g) => g.color).filter(Boolean))
  const libres = GROUP_PALETTE.filter((c) => !prises.has(c))
  let i = 0
  return groups.map((g) => {
    if (g.color) return g
    if (g.isFallback) return { ...g, color: NEUTRAL_COLOR }
    return { ...g, color: libres[i++] ?? NEUTRAL_COLOR }
  })
}

/**
 * Le libellé d'un groupe. Repli sur la CLÉ quand le groupe est inconnu de l'appelant — un lien
 * dont le groupe vient d'être supprimé garde ainsi un nom lisible plutôt qu'une case vide.
 */
export function groupLabel(groups: readonly MktGroup[], key: string): string {
  return groups.find((g) => g.key === key)?.label ?? key
}

/** Les groupes sous la forme attendue par `groupBySource` (clé, libellé, couleur). */
export function asSources(groups: readonly MktGroup[]): { key: string; label: string; color: string }[] {
  return groups.map((g) => ({ key: g.key, label: g.label, color: g.color }))
}
