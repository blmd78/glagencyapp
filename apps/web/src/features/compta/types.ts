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
  /** Prime « nouveau chatteur » enregistrée pour ce membre (`compta_primes`), null si aucune.
   *  `status` : `'due'` (à verser) | `'paid'` (versée, figée par `payFortnight`) | `'skipped'`
   *  (renoncée). Portée pour le formulaire de réglages : le CALCUL, lui, ne retient que `'due'`
   *  et passe par `payslip.prime`. */
  prime: { amount: number; status: string; paidAt: string | null } | null
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
  /** Montant RÉELLEMENT versé (instantané `compta_payments.amount`), null si non payé. Distinct
   *  de `payslip.net`, qui est le recalcul du jour : c'est cette valeur-là qui fait foi. */
  paidAmount: number | null
}

export interface ComptaData {
  fortnight: Fortnight
  /** Quinzaine TERMINÉE (son dernier jour est révolu) — seul cas où le paiement est ouvert.
   *  Calculé côté serveur, comme le garde de `payFortnight` : un `todayParis()` évalué dans le
   *  composant client dépendrait de l'horloge du poste, alors que c'est le serveur qui tranche. */
  fortnightElapsed: boolean
  /** Quinzaines proposées au sélecteur, la plus récente d'abord. */
  choices: Fortnight[]
  rows: ComptaRow[]
  /** Quinzaines ÉCHUES dont un jour n'est couvert par aucun paiement — pour un membre qu'elles
   *  CONCERNENT, c'est-à-dire déjà arrivé (`chatter_first_seen()`). Les membres non reliés à
   *  MyPuls en sont exclus : l'application ne peut pas les payer. */
  overdue: Fortnight[]
}
