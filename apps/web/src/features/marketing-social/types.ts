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
  // ── X : le global du compte (relevé par l'API X, 0177/0178) ──
  /** Tweets publiés sur la période : dernier − premier total de tweets relevé. */
  postsPeriod: number | null
  /** Au dernier relevé. */
  following: number | null
  listed: number | null
  bioUrl: string | null
  bioText: string | null
  /** Dernier tweet, ISO. */
  lastPostAt: string | null
  verifiedType: string | null
  /** Pays où X bride le compte ; `null` : nulle part. */
  withheldCountries: string[] | null
  /** Sur le compte (réécrits chaque nuit). */
  name: string | null
  avatarUrl: string | null
  accountCreatedAt: string | null
}

export interface MktSocialData {
  period: string
  platform: 'instagram' | 'twitter' | 'telegram'
  accounts: MktSocialRow[]
  totals: { followers: number; viewsPeriod: number }
  /** Date du dernier relevé toutes lignes confondues (null si aucune donnée). */
  lastDate: string | null
}
