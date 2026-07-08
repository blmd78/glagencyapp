// Types / forme des props du pôle « marketing » (liens de tracking, comptes sociaux, staff).

export interface MktLinkRow {
  id: string
  name: string
  type: 'twitter' | 'instagram' | 'telegram' | 'other'
  url: string
  creator: string | null
  /** VA assignés au lien (nom + couleur de fiche) — vides pour un manager si le lien
   *  appartient aux VA d'un autre (RLS owner_id sur mkt_staff). */
  staff: { name: string; color: string }[]
  active: boolean
  /** Agrégats sur la période filtrée. */
  clicks: number
  conversions: number
  revenueEur: number
  /** €/conversion sur la période (null si 0 conversion). */
  ltv: number | null
  /** Taux de conversion % (conversions/clics, null si 0 clic). */
  taux: number | null
}

export interface MktLinksData {
  period: string
  links: MktLinkRow[]
  totals: { clicks: number; conversions: number; revenueEur: number }
}

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

export interface MktSocialRow {
  id: string
  handle: string
  creator: string | null
  staff: string | null
  active: boolean
  status: string | null
  /** Dernier relevé disponible. */
  followers: number | null
  lastDate: string | null
  /** Sur la période filtrée. */
  deltaFollowers: number | null
  viewsPeriod: number | null
  engagementPeriod: number | null
}

export interface MktSocialData {
  period: string
  platform: 'instagram' | 'twitter' | 'telegram'
  accounts: MktSocialRow[]
  totals: { followers: number; viewsPeriod: number }
  /** Date du dernier relevé toutes lignes confondues (null si aucune donnée). */
  lastDate: string | null
}

export interface MktStaffRow {
  id: string
  name: string
  role: 'va' | 'manager'
  color: string
  fixedEur: number
  rateTw: number
  rateIg: number
  bonusEur: number
  pct: number
  paymentMethod: string
  active: boolean
  /** Assignations. */
  linkIds: string[]
  igAccountIds: string[]
  /** Comptes Twitter suivis — affichage uniquement, aucun impact paye. */
  twAccountIds: string[]
  /** Paye calculée sur la période. */
  pay: {
    fixed: number
    twConversions: number
    twVariable: number
    igViews: number
    igVariable: number
    bonus: number
    pctAmount: number
    total: number
  }
  /** Paiements enregistrés sur les mois de la période. */
  paid: number
  remaining: number
}

export interface MktStaffData {
  period: string
  staff: MktStaffRow[]
  totalBudget: number
  totalPaid: number
  totalRemaining: number
  /** Revenus des liens du pôle sur la période (contexte). */
  periodRevenue: number
  /** 1er jour du mois de la période — mois de rattachement des paiements. */
  monthStart: string
  /** Options des sélecteurs d'assignation. */
  linkOptions: { id: string; name: string; type: 'twitter' | 'instagram' | 'telegram' | 'other' }[]
  igOptions: { id: string; handle: string }[]
  twOptions: { id: string; handle: string }[]
}
