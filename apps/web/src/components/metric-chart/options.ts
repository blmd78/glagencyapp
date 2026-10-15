// Options des graphes « par jour » du pôle marketing (Overview, Liens de tracking). Module SANS
// recharts : le panneau (client, chargé tout de suite) les importe, alors que le graphe reste
// derrière son `dynamic()` — importer ces constantes depuis le `.client` ramènerait recharts
// dans le bundle critique.

/** Un lien dans la répartition d'un jour : ses subs et son CA. `creator` départage les
 *  homonymes (plusieurs SNAP_HAPPN, un par modèle). */
export interface LinkDay {
  name: string
  creator: string | null
  subs: number
  revenue: number
}

/** Un jour : ce que les deux écrans savent fournir. */
export interface MetricPoint {
  date: string
  revenue: number
  conversions: number
  clicks: number
  /** D'où viennent les subs et le CA du jour : chaque lien qui a amené l'un ou l'autre, dans
   *  n'importe quel ordre (l'infobulle et le détail trient selon la métrique). Absent (la modale
   *  d'un seul lien) → l'infobulle n'affiche que le total et le clic sur un jour ne fait rien. */
  byLink?: LinkDay[]
}

/** Les métriques qui se répartissent par lien au survol et au clic. Pas les clics : demandés
 *  pour les subs (2026-10-12) puis le CA (2026-10-15), jamais pour eux. */
export const BY_LINK_METRICS = ['revenue', 'conversions'] as const
export type ByLinkMetric = (typeof BY_LINK_METRICS)[number]
export const isByLinkMetric = (m: string): m is ByLinkMetric => (BY_LINK_METRICS as readonly string[]).includes(m)

/** Les liens d'un jour qui comptent pour la métrique, les plus gros d'abord. */
export function linksFor(point: MetricPoint, metric: ByLinkMetric): { name: string; creator: string | null; value: number }[] {
  const key = metric === 'revenue' ? 'revenue' : 'subs'
  return (point.byLink ?? [])
    .filter((l) => l[key] > 0)
    .map((l) => ({ name: l.name, creator: l.creator, value: l[key] }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

/** Liens listés dans l'infobulle, le reste cumulé en « Autres » : 17 à 29 liens convertissent
 *  chaque jour (octobre 2026), tous listés l'infobulle dépasserait le graphe. La liste entière
 *  s'ouvre au clic sur le jour, sous le graphe. */
export const TOOLTIP_LINKS = 10

/** Couleurs par MÉTRIQUE (légende legacy : violet / vert / bleu) — quand aucun réseau n'est isolé. */
export const SERIES = {
  revenue: { label: 'Revenus', color: '#8b5cf6' },
  conversions: { label: 'Subs', color: '#22c55e' },
  clicks: { label: 'Clics', color: '#0ea5e9' },
} as const

export type Metric = keyof typeof SERIES
export const METRICS: Metric[] = ['revenue', 'conversions', 'clicks']

/** Le rendu : barres, courbe, ou les deux superposées (le défaut, demande Benoit 2026-09-23). */
export type ChartMode = 'bars' | 'line' | 'both'
