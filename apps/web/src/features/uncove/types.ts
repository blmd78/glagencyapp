// Types de la feature Uncove (analytics par compte). Les tables uncove_* sont typées depuis la
// régénération de packages/db/src/types.ts (0163 + 0164) ; ces types-ci décrivent la forme
// APPLICATIVE consommée par l'UI.

export type UncoveStatus = 'ok' | 'reconnect'

/** Ligne d'administration d'un compte (écran Comptes). */
export interface UncoveAccountRow {
  id: string
  label: string
  uncoveUserId: string
  status: UncoveStatus
  lastSyncedAt: string | null
  /** Modèle CRM rattachée — null = le CA compte au total agence, sans ligne au classement (0164). */
  creatorId: string | null
  creatorName: string | null
  /** « CA hors MyPuls » : ce CA s'ajoute au CA de l'agence dans l'Overview (0164). */
  countsInCa: boolean
}

/** Option du sélecteur « Modèle CRM ». */
export interface CreatorOption {
  id: string
  name: string
}

/** Agrégat d'un compte sur la période (dashboard). */
export interface UncoveAccountStat {
  id: string
  label: string
  status: UncoveStatus
  currentSubs: number
  newSubs: number
  canceledSubs: number
  revenue: number
}

export interface UncoveDashboardData {
  accounts: UncoveAccountStat[]
  totals: { currentSubs: number; newSubs: number; canceledSubs: number; revenue: number }
  periodLabel: string
  /** Date du dernier relevé présent dans la plage (pour « abonnés actifs au … »), null si aucun. */
  asOf: string | null
}
