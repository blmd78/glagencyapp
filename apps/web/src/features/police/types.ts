// Types / forme des props de la feature « Police » (tracker sanctions chatteurs).

/** 11 types d'erreurs contrôlés — repris de l'outil HTML source (setters/closers). */
export const POLICE_ERRORS = [
  { key: 'media_argent', label: 'Parle de média/argent directement' },
  { key: 'reactivite', label: 'Réponse > 45 s par sub' },
  { key: 'media_rapide', label: 'Envoi de média trop rapide' },
  { key: 'fautes', label: "Fautes d'orthographe" },
  { key: 'setter_lent', label: 'Ne récupère pas vite les nouveaux (setter)' },
  { key: 'hors_script', label: "Ne suit pas l'histoire du script" },
  { key: 'sexu_faible', label: 'Sexualisation faible (ne fait pas baver)' },
  { key: 'promesse', label: 'Promesse non tenue (setter)' },
  { key: 'temps_media', label: "N'attend pas le temps du média" },
  { key: 'infos_non_transmises', label: 'Ne transmet pas les infos' },
  { key: 'infos_non_notees', label: 'Ne note pas les infos' },
] as const

export type PoliceErrorKey = (typeof POLICE_ERRORS)[number]['key']

/** Moments de contrôle (métadonnée optionnelle sur une ligne). */
export const SHIFTS = ['matin', 'aprem', 'soir'] as const
export type Shift = (typeof SHIFTS)[number]

export interface EntityOption {
  id: string
  name: string
}

export interface DayChoice {
  day: string
  label: string
}

export interface MonthChoice {
  /** 1er du mois (YYYY-MM-01). */
  month: string
  label: string
}

/** Une ligne du journal : avertissement (erreur) OU malus (montant décidé). */
export interface PoliceEntry {
  id: string
  chatterId: string
  chatterName: string
  controllerName: string
  kind: 'warning' | 'malus'
  errorKey: string | null
  errorLabel: string | null
  amountEur: number
  note: string | null
  shift: string | null
  createdAt: string
}

export interface PoliceData {
  /** Mode d'affichage (en-tête) : `jour` (mono-jour) ou `mois` (plage du mois). */
  vue: 'jour' | 'mois'
  /** Jour affiché (YYYY-MM-DD). */
  day: string
  /** Libellé « lundi 07/07 ». */
  dayLabel: string
  /** Mois affiché (1er du mois, YYYY-MM-01). */
  month: string
  /** Libellé « juillet 2026 ». */
  monthLabel: string
  /** Entrées de la période : du JOUR (mode jour) OU du MOIS (mode mois), plus récent d'abord. */
  entries: PoliceEntry[]
  /** Chatteurs actifs — options des formulaires (saisie masquée en mois). */
  chatterOptions: EntityOption[]
  /** chatterId → nb d'avertissements récents (fenêtre 30 j) — aide la décision de malus. Vide en mois. */
  warningsByChatter: Record<string, number>
  /** KPIs agrégés sur la période affichée (jour OU mois). */
  totalMalusEur: number
  warningCount: number
  chattersConcerned: number
  /** Jours proposés au sélecteur (aujourd'hui + 13 passés). */
  days: DayChoice[]
  /** Mois proposés au sélecteur (mois courant + 11 passés). */
  months: MonthChoice[]
}
