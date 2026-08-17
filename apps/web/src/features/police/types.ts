// Types / forme des props de la feature « Police » (tracker sanctions chatteurs).
// Les motifs de sanction (`POLICE_ERRORS`, `ERROR_LABEL`) vivent dans
// `lib/types/police-errors.ts` — partagés avec `features/compta` (import cross-feature interdit).

import type { Period } from '@/lib/period'

/** Moments de contrôle (métadonnée optionnelle sur une ligne). */
export const SHIFTS = ['matin', 'aprem', 'soir'] as const

export interface EntityOption {
  id: string
  name: string
}

/** Une ligne du journal : avertissement (erreur) OU malus (montant décidé). */
export interface PoliceEntry {
  id: string
  chatterId: string
  chatterName: string
  controllerName: string
  kind: 'warning' | 'malus'
  /** Clé brute du motif (`POLICE_ERRORS`) — pré-remplit le form d'édition. */
  errorKey: string | null
  errorLabel: string | null
  amountEur: number
  note: string | null
  shift: string | null
  /** Jour de la faute (YYYY-MM-DD) — affiché par entrée (la période peut couvrir plusieurs jours). */
  occurredOn: string
  createdAt: string
}

export interface PoliceData {
  /** Période affichée (`?from&to` du datepicker global, résolue par `resolvePeriod`) — les
   *  bornes servent aussi au formulaire (signaler une saisie datée HORS période). */
  period: Period
  /** Entrées de la période, plus récent d'abord. */
  entries: PoliceEntry[]
  /** Chatteurs actifs — options du formulaire de saisie. */
  chatterOptions: EntityOption[]
  /** chatterId → nb d'avertissements récents (30 j glissants, borné au périmètre) — aide la
   *  décision de malus. Vide pour un lecteur seul (la saisie qu'elle alimente est masquée). */
  warningsByChatter: Record<string, number>
}
