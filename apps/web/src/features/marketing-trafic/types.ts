import type { LsFlag, LsPlatform, LsTotals } from '@glagency/core'

export type TraficTab = 'profils' | 'modeles' | 'reseaux' | 'liens'

/** Ce que la fenêtre de correction lit et renvoie (une ligne de lien seulement). */
export interface TraficEdit {
  linkId: string
  creatorId: string | null
  platform: LsPlatform
  socialAccountId: string | null
  operator: string | null
  manual: boolean
}

export interface TraficRow {
  key: string
  label: string
  /** URL du lien, ou « N lien(s) » pour un regroupement. */
  sub: string | null
  creatorName: string | null
  platform: LsPlatform | null
  cur: LsTotals
  prev: LsTotals
  rate: number | null
  botShare: number | null
  /** Évolution des visiteurs vs période précédente, en % ; null sans période précédente. */
  deltaPct: number | null
  flags: LsFlag[]
  edit: TraficEdit | null
}

export interface TraficDay {
  date: string
  visitors: number
  mymClicks: number
}

export interface TraficData {
  periodLabel: string
  /** Dernier jour de la période (`YYYY-MM-DD`). */
  to: string
  totals: { cur: LsTotals; prev: LsTotals }
  daily: TraficDay[]
  /** Une ligne par lien LinkScale — la seule vue où l'on corrige l'attribution. */
  links: TraficRow[]
  /** Regroupement par profil : compte Instagram, opérateur X, ou note. */
  profiles: TraficRow[]
  models: TraficRow[]
  networks: TraficRow[]
  creators: { id: string; name: string }[]
  accounts: { id: string; handle: string }[]
  /** Dernier jour relevé dans la période ; null si aucun. */
  lastDate: string | null
}
