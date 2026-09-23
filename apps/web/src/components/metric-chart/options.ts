// Options des graphes « par jour » du pôle marketing (Overview, Liens de tracking). Module SANS
// recharts : le panneau (client, chargé tout de suite) les importe, alors que le graphe reste
// derrière son `dynamic()` — importer ces constantes depuis le `.client` ramènerait recharts
// dans le bundle critique.

/** Un jour : ce que les deux écrans savent fournir. */
export interface MetricPoint {
  date: string
  revenue: number
  conversions: number
  clicks: number
}

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
