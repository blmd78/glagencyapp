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
  days: number
  avgRevenuePerDay: number
  bestDay: { date: string; revenue: number } | null
  topCreator: { name: string; revenueEur: number } | null
  daily: MktDailyPoint[]
  topLinks: MktLinkRow[]
  byCreator: MktCreatorSplit[]
}
