// Types / forme des props de la feature « Police » (tracker sanctions chatteurs).
// Les motifs de sanction (`POLICE_ERRORS`, `ERROR_LABEL`) vivent dans
// `lib/types/police-errors.ts` — partagés avec `features/compta` (import cross-feature interdit).

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
  errorLabel: string | null
  amountEur: number
  note: string | null
  shift: string | null
  /** Jour de la faute (YYYY-MM-DD) — affiché par entrée (la période peut couvrir plusieurs jours). */
  occurredOn: string
  createdAt: string
}

export interface PoliceData {
  /** Libellé humain de la période affichée (ex. « Juillet 2026 », « 3 juin – 15 juin 2026 »). */
  periodLabel: string
  /** Entrées de la période (`?from&to` du datepicker global), plus récent d'abord. */
  entries: PoliceEntry[]
  /** Chatteurs actifs — options du formulaire de saisie. */
  chatterOptions: EntityOption[]
  /** chatterId → nb d'avertissements récents (fenêtre 30 j, borné au périmètre) — aide la
   *  décision de malus. */
  warningsByChatter: Record<string, number>
}
