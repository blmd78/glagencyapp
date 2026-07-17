// Types / forme des props de la feature marketing-social.

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
