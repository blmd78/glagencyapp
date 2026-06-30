/**
 * Contrat de données de l'Overview.
 * C'est exactement la forme que renverra le RPC Supabase plus tard :
 * en basculant `services/get-overview.ts` sur la vraie source, l'affichage ne bouge pas.
 */

export interface Kpi {
  key: string
  /** Libellé de la carte, ex. « CA du mois ». */
  label: string
  /** Valeur déjà formatée pour l'affichage, ex. « 252 243 € ». */
  value: string
  /** Variation en % vs période précédente (signe significatif). */
  deltaPct: number
  /** Phrase de tendance, ex. « En hausse ce mois ». */
  trendLabel: string
  /** Sous-titre discret, ex. « vs mois dernier ». */
  hint: string
}

export interface DailyPoint {
  /** Date ISO `YYYY-MM-DD`. */
  date: string
  /** CA du jour (€). */
  revenue: number
}

export interface OverviewData {
  /** Libellé de période courante, ex. « Juin 2026 ». */
  periodLabel: string
  kpis: Kpi[]
  /** Série quotidienne complète ; le graphe filtre la plage côté client. */
  daily: DailyPoint[]
}
