// Types / forme des props de la feature marketing-dashboard.

import type { MktLinkRow } from '@/lib/types/marketing'

export interface MktDailyPoint {
  date: string
  revenue: number
  conversions: number
  clicks: number
}

export interface MktCreatorSplit {
  creator: string
  revenueEur: number
  conversions: number
  clicks: number
}

export interface MktDashboardData {
  period: string
  totals: { clicks: number; conversions: number; revenueEur: number; ltv: number | null }
  /** Revenus de la période précédente (même durée), pour le badge d'évolution. */
  prevRevenueEur: number
  /** LTV de la période précédente — REPÈRE de la jauge, pas un badge : une jauge à une seule
   *  valeur ne dit rien. `null` si la période précédente n'a amené aucun abonné. */
  prevLtv: number | null
  days: number
  avgRevenuePerDay: number
  bestDay: { date: string; revenue: number } | null
  topCreator: { name: string; revenueEur: number } | null
  daily: MktDailyPoint[]
  topLinks: MktLinkRow[]
  byCreator: MktCreatorSplit[]
}
