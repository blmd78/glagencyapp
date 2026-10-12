// Options des graphes « par jour » du pôle marketing (Overview, Liens de tracking). Module SANS
// recharts : le panneau (client, chargé tout de suite) les importe, alors que le graphe reste
// derrière son `dynamic()` — importer ces constantes depuis le `.client` ramènerait recharts
// dans le bundle critique.

/** Un lien dans la répartition des subs d'un jour. `creator` départage les homonymes
 *  (plusieurs SNAP_HAPPN, un par modèle). */
export interface LinkSubs {
  name: string
  creator: string | null
  subs: number
}

/** Un jour : ce que les deux écrans savent fournir. */
export interface MetricPoint {
  date: string
  revenue: number
  conversions: number
  clicks: number
  /** Overview seulement : d'où viennent les subs du jour, TOUS les liens, les plus gros d'abord.
   *  Absent → l'infobulle n'affiche que le total et le clic sur un jour ne fait rien. */
  subsByLink?: LinkSubs[]
}

/** Liens listés dans l'infobulle des subs, le reste cumulé en « Autres » : 17 à 29 liens
 *  convertissent chaque jour (octobre 2026), tous listés l'infobulle dépasserait le graphe.
 *  La liste entière s'ouvre au clic sur le jour, sous le graphe. */
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
