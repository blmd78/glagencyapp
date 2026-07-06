/** Bilan hebdomadaire par modèle — formules reprises de l'API legacy (/api/bilan-hebdo) :
 *  CA net = Σ ca quotidien ; LTV = CA ÷ nouveaux abonnés de la semaine ;
 *  S-1 = semaine −7 j ; M-1 (S-4) = semaine −28 j. */

export interface BilanWeekRef {
  start: string
  end: string
}

export interface ModelBilan {
  id: string
  name: string
  /** Compte privé (creators.excluded) : hors LTV moyenne, affiché à part. */
  excluded: boolean
  ca: number
  caPrev: number
  caLm: number
  newSubs: number
  newSubsPrev: number
  newSubsLm: number
  ltv: number | null
  ltvPrev: number | null
  ltvLm: number | null
}

export interface WeekChoice {
  start: string
  end: string
  label: string
}

export interface BilanData {
  week: BilanWeekRef
  prevWeek: BilanWeekRef
  lastMonthWeek: BilanWeekRef
  totalCa: number
  totalNewSubs: number
  /** LTV moyenne globale (null si aucun nouvel abonné). */
  avgLtv: number | null
  models: ModelBilan[]
  /** Semaines complètes proposées au sélecteur (la plus récente d'abord). */
  weeks: WeekChoice[]
}
