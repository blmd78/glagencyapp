import type { PayPeriod, Payslip } from '@glagency/core'

/** Une sanction Police rattachée à la période — affichée avec son motif. */
export interface ComptaSanction {
  day: string
  /** Libellé du motif (`POLICE_ERRORS`), ou null pour un malus libre. */
  label: string | null
  /** 0 € pour un avertissement. */
  amount: number
  kind: 'warning' | 'malus'
}

/** Une ligne de la pile : un chatteur sur la période affichée. */
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
   *  `status` : `'due'` (à verser) | `'paid'` (versée, figée par `payPeriod`) | `'skipped'`
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
  /** Tous les jours de la période sont couverts par un paiement. */
  paid: boolean
  paidOn: string | null
  /** Montant RÉELLEMENT versé (instantané `compta_payments.amount`), null si non payé. Distinct
   *  de `payslip.net`, qui est le recalcul du jour : c'est cette valeur-là qui fait foi. */
  paidAmount: number | null
}

export interface ComptaData {
  /** Période de paie affichée — 14 jours du lundi au dimanche (`@glagency/core`). */
  period: PayPeriod
  /** Période TERMINÉE (son dernier jour est révolu) — seul cas où le paiement est ouvert.
   *  Calculé côté serveur, comme le garde de `payPeriod` : un `todayParis()` évalué dans le
   *  composant client dépendrait de l'horloge du poste, alors que c'est le serveur qui tranche. */
  periodElapsed: boolean
  /** Périodes proposées au sélecteur, la plus récente d'abord. */
  choices: PayPeriod[]
  rows: ComptaRow[]
  /** Périodes ÉCHUES dont un jour n'est couvert par aucun paiement — pour un membre qu'elles
   *  CONCERNENT, c'est-à-dire déjà arrivé (`chatter_first_seen()`). Les membres non reliés à
   *  MyPuls en sont exclus : l'application ne peut pas les payer. */
  overdue: PayPeriod[]
  /** Chatteurs MyPuls encore LIBRES, options du dialog « Relier ». **Vide pour un non-admin** :
   *  poser le lien est admin-seul, et c'est une liste agence-wide hors périmètre RLS
   *  (`loadLinkableChatters`). */
  linkableChatters: { id: string; name: string }[]
}
