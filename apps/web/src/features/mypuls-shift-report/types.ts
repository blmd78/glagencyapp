import type { MypulsSegment, MypulsVacation, SlotKey } from '@glagency/core'

export interface ShiftRun {
  ranAt: string
  idleMinutes: number
  coverageThreshold: number
  /** Nombre de libellés MyPuls non rattachés au CRM sur ce run. */
  unmatched: number
}

/**
 * Les tuiles du haut de `mypuls_day_kpi`, au grain JOUR et pour toute l'agence.
 *
 * Plus affichées telles quelles : elles ignoraient le filtre de créneau ET le périmètre
 * modèles, si bien que l'écran donnait « 250 chatteurs actifs » (agence, journée) au-dessus
 * d'un tableau montrant 14 lignes (un créneau, mes modèles). Deux chiffres pour la même chose
 * au même écran, c'est un chiffre faux. Conservé pour une courbe d'agence plus tard.
 */
export interface ShiftDayKpi {
  day: string
  chatters_actifs: number
  vacations: number
  active_minutes: number
  messages: number
  models_worked: number
  models_total: number
  slots_held: number
  slots_total: number
}

/**
 * Les tuiles RÉELLEMENT affichées : dérivées des lignes que le tableau montre.
 *
 * Elles suivent donc le créneau choisi et le périmètre modèles de l'appelant — comme les
 * tuiles de la page Police, calculées sur les entrées affichées pour que « les cartes et la
 * table racontent la même chose ».
 *
 * En revanche elles ne suivent PAS les deux bascules d'affichage (« seulement leur créneau »,
 * « sous le seuil seulement ») : « Postes tenus » afficherait sinon 0/N dès qu'on filtre sur
 * les écarts, ce qui ne veut plus rien dire.
 */
export interface ReportKpi {
  chatters: number
  activeMinutes: number
  messages: number
  vacations: number
  models: number
  held: number
  total: number
}

export interface CoverageRow {
  slot: SlotKey
  mypulsUserId: string
  chatterLabel: string
  /** `chatters.id` — LA clé d'identité, qui existe sans compte membre (0144). */
  chatterId: string | null
  /** `profiles.id` — seulement pour qui a un compte. Porte le créneau attendu, la fiche
   *  d'activité et la possibilité d'un signalement. */
  profileId: string | null
  memberName: string | null
  memberShift: SlotKey | null
  /** Le créneau consulté est-il CELUI de la personne (`profiles.shift`) ? */
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

export interface SilentChatter {
  profileId: string
  memberName: string
}

/** Segment renvoyé par la RPC — instants ISO, avant conversion en `MypulsSegment`. */
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

/** Réponse brute de la RPC — castée explicitement depuis `Json`. */
export interface ShiftBoardRpc {
  run: ShiftRun | null
  kpi: ShiftDayKpi | null
  rows: CoverageRow[]
  segments: RawSegment[]
  silent: SilentChatter[]
}

/**
 * Une ligne prête à afficher, avec ce que l'ancien board montrait : la barre de couverture, le
 * retard, et la timeline dépliable.
 */
export interface ReportRow extends CoverageRow {
  /** Durée du créneau, en minutes — dénominateur de la barre. */
  slotMinutes: number
  /** Minutes manquantes pour atteindre le seuil. 0 si le poste est tenu. */
  missingMinutes: number
  /** Retard sur la prise de poste, en minutes. Null si pas de première activité. */
  latenessMinutes: number | null
  held: boolean
  /** Sessions de travail du créneau — la timeline de l'ancien écran. */
  vacations: MypulsVacation[]
}

/** Une carte de l'ancien board : un modèle, ses chatteurs. */
export interface ModelGroup {
  model: string
  rows: ReportRow[]
  /** Nombre de chatteurs sous le seuil — le « N à sanctionner » rouge de l'en-tête. */
  belowCount: number
}

/** Filtre de créneau. `all` = journée complète, l'option par défaut (comme l'ancien board). */
export type SlotFilter = SlotKey | 'all'

export interface ShiftReport {
  run: ShiftRun | null
  kpi: ReportKpi | null
  groups: ModelGroup[]
  silent: SilentChatter[]
  day: string
  slot: SlotFilter
  /** Filtres actifs, reflétés dans l'URL. Tous deux ÉTEINTS par défaut : l'écran montre
   *  d'abord tout ce que MyPuls a mesuré, et on restreint ensuite si on veut. */
  onlyExpected: boolean
  belowOnly: boolean
  dayOptions: { value: string; label: string }[]
  available: boolean
  threshold: number
  /** Nombre total de lignes du créneau, avant filtres — pour dire ce qui est masqué. */
  totalRows: number
  /** Lignes au-dessus du seuil, avant filtres. Le numérateur de « Postes tenus ». */
  heldRows: number
  /** Le lien « Signaler » est-il proposé ? Droit d'écriture Police ET jour dans la fenêtre
   *  de saisie de 14 jours — proposer un geste que le serveur rejettera est pire que rien. */
  canReport: boolean
}

export type { MypulsSegment, MypulsVacation }
