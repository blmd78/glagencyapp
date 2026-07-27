import type { Fortnight, Payslip } from '@glagency/core'

/** Une sanction Police rattachée à la quinzaine — affichée avec son motif. */
export interface ComptaSanction {
  day: string
  /** Libellé du motif (`POLICE_ERRORS`), ou null pour un malus libre. */
  label: string | null
  /** 0 € pour un avertissement. */
  amount: number
  kind: 'warning' | 'malus'
}

/** Une ligne de la pile : un chatteur sur la quinzaine affichée. */
export interface ComptaRow {
  /** `profiles.id` — la compta est clée sur les MEMBRES depuis 0085. */
  id: string
  name: string
  role: string
  /** `profiles.chatter_id` — null = non relié à MyPuls, donc aucun CA calculable. */
  chatterId: string | null
  mode: 'percent' | 'fixed'
  rate: number
  fixedAmount: number
  isSetter: boolean
  handoffs: number
  /** CA par modèle (nom du modèle → €), pour la ventilation de la fiche. */
  modelCa: Record<string, number>
  sanctions: ComptaSanction[]
  /** Saisies hebdo existantes, indexées par lundi — alimente le formulaire de saisie. */
  weekEntries: Record<
    string,
    { bonus: number; malus: number; handoffs: number; fixeSetter: number; note: string | null }
  >
  payslip: Payslip
  /** Tous les jours de la quinzaine sont couverts par un paiement. */
  paid: boolean
  paidOn: string | null
}

export interface ComptaData {
  fortnight: Fortnight
  /** Quinzaines proposées au sélecteur, la plus récente d'abord. */
  choices: Fortnight[]
  rows: ComptaRow[]
  /** Quinzaines ÉCHUES dont un jour n'est couvert par aucun paiement. */
  overdue: Fortnight[]
}
