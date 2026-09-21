// Types de la feature Uncove (analytics par compte). Les tables uncove_* (migration 0163) ne
// sont pas encore dans les types Supabase générés → services/actions accèdent en `as never`
// (précédent ingest_session) ; ces types-ci décrivent la forme APPLICATIVE consommée par l'UI.

export type UncoveStatus = 'ok' | 'reconnect'

/** Ligne d'administration d'un compte (écran Comptes). */
export interface UncoveAccountRow {
  id: string
  label: string
  uncoveUserId: string
  status: UncoveStatus
  lastSyncedAt: string | null
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
}
