// Types / forme des props de la feature marketing-dashboard.

import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktScope } from '@/lib/mkt-sfs'
import type { LinkDay } from '@/components/metric-chart/options'

export interface MktDailyPoint {
  date: string
  revenue: number
  conversions: number
  clicks: number
  /** Tous les liens qui ont amené des subs ou du CA ce jour-là (survol et clic sur un jour). */
  byLink: LinkDay[]
}

export interface MktCreatorSplit {
  creator: string
  revenueEur: number
  conversions: number
  clicks: number
}

export interface MktDashboardData {
  period: string
  /** Liens comptés : l'Overview (`externe`, sans les SFS) ou l'onglet SFS (`sfs`). */
  scope: MktScope
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
