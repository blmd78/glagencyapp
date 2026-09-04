import type { MypulsVacation, SlotKey } from '@glagency/core'

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

// ---------------------------------------------------------------------------
// GRAIN JOUR — quand le sélecteur du header ne retient qu'une seule journée
// ---------------------------------------------------------------------------
// L'écran CHANGE DE GRAIN avec la période, parce que les deux questions sont différentes :
// « qui a tenu son poste hier » veut une jauge en minutes et la timeline des sessions ;
// « qui a tenu ses postes ce mois-ci » veut un compte de jours. Afficher l'un dans le grain de
// l'autre, c'est répondre à côté — une jauge en minutes n'a aucun sens sur trente jours, et un
// compte de jours vaut 1/1 sur une journée.

/** Le grain de lecture, décidé par la longueur de la période du header. */
export type ReportMode = 'day' | 'period'

export interface DayCoverageRow {
  slot: SlotKey
  mypulsUserId: string
  chatterLabel: string
  /** `chatters.id` — LA clé d'identité, qui existe sans compte membre (0144). */
  chatterId: string | null
  /** `profiles.id` — porte le créneau attendu, la fiche et la possibilité d'un signalement. */
  profileId: string | null
  memberName: string | null
  memberShift: SlotKey | null
  /** Le créneau consulté est-il CELUI de la personne ? Sinon c'est du renfort (D7). */
  isExpected: boolean
  coveragePct: number
  activeMinutes: number
  messages: number
  firstAt: string | null
  lastAt: string | null
  slotStartAt: string
  slotEndAt: string
  /** Modèles OBSERVÉS, du plus bavard au moins bavard. */
  models: string[]
}

/** Segment renvoyé par la RPC du jour — instants ISO, avant regroupement en vacations. */
export interface RawSegment {
  mypulsUserId: string
  chatterId?: string | null
  day: string
  startedAt: string
  endedAt: string
  activeMinutes: number
  messages: number
  models: { label: string; messages: number }[]
}

export interface SilentChatter {
  profileId: string
  memberName: string
}

/** Réponse brute de `mypuls_shift_board` (un jour) — castée explicitement depuis `Json`. */
export interface ShiftBoardRpc {
  run: ShiftRun | null
  rows: DayCoverageRow[]
  segments: RawSegment[]
  silent: SilentChatter[]
}

export interface DayReportRow extends DayCoverageRow {
  /** Durée du créneau, en minutes — dénominateur de la barre. */
  slotMinutes: number
  /** Minutes manquantes pour atteindre le seuil. 0 si le poste est tenu. */
  missingMinutes: number
  /** Retard sur la prise de poste, en minutes. Null si pas de première activité. */
  latenessMinutes: number | null
  /** Poste tenu. Vaut `false` sans valoir FAUTE quand la ligne n'est pas le créneau attendu. */
  held: boolean
  /** Sessions de travail du créneau — la timeline. */
  vacations: MypulsVacation[]
}

export interface DayModelGroup {
  model: string
  rows: DayReportRow[]
  /** Personnes sous le seuil SUR LEUR CRÉNEAU. Le renfort n'y entre jamais (D7). */
  belowCount: number
}

/**
 * Les tuiles du grain JOUR.
 *
 * `held`/`total` ne comptent que les lignes du créneau ATTENDU, exactement comme au grain
 * période : c'est la même correction, et l'oublier ici rouvrirait le défaut dès qu'on
 * sélectionne une seule journée.
 */
export interface DayKpi {
  chatters: number
  activeMinutes: number
  messages: number
  vacations: number
  models: number
  held: number
  total: number
  unjudgeable: number
}

export interface ShiftReportCommon {
  run: ShiftRun | null
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
  /** Nombre total de lignes (jour) ou de personnes (période), avant filtres d'affichage. */
  totalRows: number
  /** Le lien de signalement est-il proposé ? */
  canReport: boolean
}

/** Un seul jour sélectionné : jauge en minutes, timeline dépliable, attendus silencieux. */
export interface ShiftReportDay extends ShiftReportCommon {
  mode: 'day'
  day: string
  /** Jours proposés au sélecteur — le mode JOUR ignore la période du header, par définition. */
  dayOptions: { value: string; label: string }[]
  kpi: DayKpi
  groups: DayModelGroup[]
  silent: SilentChatter[]
}

/** Plusieurs jours : compte de jours tenus, sans dépliage (le DOM ne le supporterait pas). */
export interface ShiftReportPeriod extends ShiftReportCommon {
  mode: 'period'
  kpi: ReportKpi
  groups: ModelGroup[]
}

export type ShiftReport = ShiftReportDay | ShiftReportPeriod
