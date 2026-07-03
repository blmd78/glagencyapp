/**
 * Contrat de données de l'Overview.
 * C'est exactement la forme que renverra le RPC/agrégat Supabase plus tard :
 * en basculant `services/get-overview.ts` sur la vraie source, l'affichage ne bouge pas.
 */

// Kpi vit désormais dans @/components/kpi-card (partagé entre features) ; ré-exporté ici
// pour que le contrat OverviewData reste auto-suffisant.
import type { Kpi } from '@/components/kpi-card'
export type { Kpi }

/** CA d'un modèle sur la période (rang décroissant). */
export interface ModelCa {
  name: string
  ca: number
  /** Part du CA total, en %. */
  part: number
  isPrivate: boolean
}

/** Nouveaux abonnés d'un modèle sur la période. */
export interface ModelSubs {
  name: string
  subs: number
}

/**
 * Point quotidien du graphe CA. La série couvre toujours le(s) mois entier(s) de la
 * période sélectionnée. `revenue: null` = jour après aujourd'hui (pas de donnée) ;
 * `inPeriod: false` = jour du mois hors sélection (affiché atténué, exclu du total).
 */
export interface DailyPoint {
  date: string
  revenue: number | null
  inPeriod: boolean
}

export type InsightSeverity = 'critical' | 'warning' | 'opportunity' | 'insight'

/** Un point d'attention issu du moteur d'insights (règles). */
export interface Insight {
  id: string
  severity: InsightSeverity
  /** Équipe/modèle concerné, ou « all » pour l'agence. */
  team: string
  title: string
  body: string
  recommendation: string
  category: string
  icon: string
}

export interface OverviewData {
  /** Libellé de période courante, ex. « Juin 2026 ». */
  periodLabel: string
  kpis: Kpi[]
  caByModel: ModelCa[]
  subsByModel: ModelSubs[]
  /** Série quotidienne du CA sur la période (tous les jours ; null après aujourd'hui). */
  daily: DailyPoint[]
  insights: Insight[]
}
