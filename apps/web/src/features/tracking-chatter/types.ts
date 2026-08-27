import type { AppItem, ModelTime } from '@glagency/core'

/** Cumul d'une période — c'est une somme de verdicts JOURNALIERS, pas une fenêtre continue. */
export interface PeriodTotals {
  /** Jours de la période où le chatteur a travaillé (app lancée). */
  workedDays: number
  /** Parmi eux, ceux jugés conformes. */
  compliantDays: number
  effectiveMinutes: number
  activeMinutes: number
  countedPauseMinutes: number
  idleMinutes: number
  offTaskMinutes: number
}

export interface ChatterData {
  profileId: string
  name: string
  week: PeriodTotals
  month: PeriodTotals
  /** Cumul du mois, sur le temps actif. */
  sites: AppItem[]
  models: ModelTime[]
}
