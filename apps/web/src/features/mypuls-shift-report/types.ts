import type { SlotKey } from '@glagency/core'

export interface ShiftRun {
  ranAt: string
  idleMinutes: number
  coverageThreshold: number
  /** Nombre de libellés MyPuls non rattachés au CRM sur ce run. */
  unmatched: number
}

/**
 * Un agrégat (personne × créneau) sur la période, tel que le rend la RPC.
 *
 * `held` est un COMPTE de jours au-dessus du seuil, jamais une moyenne de pourcentages :
 * moyenner des verdicts MyPuls fabriquerait un chiffre invérifiable, à côté d'un seuil qui
 * coûte de l'argent.
 */
export interface RangeRow {
  mypulsUserId: string
  chatterId: string | null
  profileId: string | null
  chatterLabel: string
  slot: SlotKey
  days: number
  held: number
  activeMinutes: number
  messages: number
  firstDay: string
  lastDay: string
  /** Retard moyen à la prise de poste, en minutes. Null si aucune première activité connue. */
  latenessAvg: number | null
}

/** Réponse brute de `mypuls_shift_board_range` — castée explicitement depuis `Json`. */
export interface BoardRangeRpc {
  missingDays: string[]
  run: ShiftRun | null
  rows: RangeRow[]
  /** `mypuls_user_id` → modèles observés, du plus bavard au moins bavard. */
  models: Record<string, string[]>
  totals: { days: number; activeMinutes: number; messages: number }
}

/** L'activité d'une personne sur UN créneau. */
export interface SlotActivity {
  slot: SlotKey
  /** Jours où la personne a une ligne de couverture sur ce créneau. */
  days: number
  /** Jours au-dessus du seuil. */
  held: number
  activeMinutes: number
  messages: number
  latenessAvg: number | null
}

/**
 * Une personne sur la période.
 *
 * La distinction `expected` / `other` est le cœur de l'écran, et c'est la décision D7 de la
 * spec : **seul le créneau de `profiles.shift` peut valoir un écart**. Le reste est du renfort
 * — quelqu'un qui dépanne un autre créneau y a par construction une couverture minuscule
 * (16 % de moyenne, mesuré en production le 2026-09-04), et le compter comme une faute
 * reviendrait à sanctionner le zèle.
 */
export interface ReportRow {
  key: string
  mypulsUserId: string
  chatterId: string | null
  profileId: string | null
  /** Nom du compte membre, sinon du chatteur, sinon le libellé MyPuls. */
  name: string
  /** Créneau attendu (`profiles.shift`). Null = rien à comparer, la personne n'est pas jugée. */
  memberShift: SlotKey | null
  /** Le créneau attendu — LE seul qui vaut verdict. Null si aucune activité dessus. */
  expected: SlotActivity | null
  /** Les autres créneaux : affichés, jamais un écart. */
  other: SlotActivity[]
  /** Jours distincts travaillés, tous créneaux confondus. */
  daysWorked: number
  activeMinutes: number
  messages: number
  models: string[]
}

/** Une carte de l'ancien board : un modèle, ses chatteurs. */
export interface ModelGroup {
  model: string
  rows: ReportRow[]
  /** Personnes ayant manqué au moins un jour sur LEUR créneau. */
  belowCount: number
}

/** Filtre de créneau. `all` = tous, l'option par défaut. */
export type SlotFilter = SlotKey | 'all'

/**
 * Les tuiles, calculées sur les lignes affichées.
 *
 * `heldDays`/`expectedDays` ne comptent QUE le créneau attendu : c'est le seul dénominateur
 * honnête. Avant cette correction, « Postes tenus » rapportait 52 tenues sur 823 lignes en
 * production — alors que 640 de ces lignes n'étaient pas jugeables (renfort, ou personne sans
 * créneau attendu). L'écran annonçait un désastre qui n'existait pas.
 */
export interface ReportKpi {
  chatters: number
  activeMinutes: number
  messages: number
  models: number
  heldDays: number
  expectedDays: number
  /** Personnes sans créneau attendu — hors de tout verdict, et signalées comme telles. */
  unjudgeable: number
}

export interface ShiftReport {
  run: ShiftRun | null
  kpi: ReportKpi
  groups: ModelGroup[]
  /** Période affichée, venue du sélecteur du header et bornée à J-1. */
  from: string
  to: string
  periodLabel: string
  /** La période demandée dépassait-elle hier ? (aujourd'hui n'est jamais relevé) */
  clampedToYesterday: boolean
  slot: SlotFilter
  /** Filtres actifs, reflétés dans l'URL. */
  onlyExpected: boolean
  belowOnly: boolean
  /** Jours de la période qu'aucun relevé n'a couverts. */
  missingDays: string[]
  /** Aucun relevé du tout sur la période → on ne montre pas des zéros. */
  available: boolean
  threshold: number
  /** Nombre total de personnes de la période, avant filtres d'affichage. */
  totalRows: number
  /** Le lien « Signaler » est-il proposé ? */
  canReport: boolean
}
