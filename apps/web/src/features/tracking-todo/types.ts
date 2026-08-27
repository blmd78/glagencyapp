/** Une tâche affichée : soit une vraie ligne, soit l'occurrence d'une habitude (voir ci-dessous). */
export interface TodoTask {
  /**
   * Identifiant réel (uuid) OU identifiant VIRTUEL `habit:<habitId>:<date>`.
   *
   * Les habitudes ne sont pas matérialisées à la lecture : une page qui écrirait en base à chaque
   * affichage serait un effet de bord dans un Server Component, et créerait des lignes pour des
   * jours que personne ne regarde jamais. Elles sont donc rendues à la volée, et n'existent en
   * base qu'au premier geste (cocher, renommer, déplacer) — c'est ce geste qui les matérialise.
   */
  id: string
  label: string
  done: boolean
  /** Vient d'une habitude récurrente et n'existe pas encore en base. */
  virtual: boolean
  /** Déposée par quelqu'un d'autre que le propriétaire — la hiérarchie, comme sur le planning. */
  fromOther: boolean
}

export interface TodoSection {
  name: string
  /** La section revient chaque semaine sur ce jour. */
  recurring: boolean
  tasks: TodoTask[]
}

export interface TodoDay {
  date: string
  /** « lundi », en toutes lettres. */
  weekdayLabel: string
  /** « 24/08 ». */
  dayLabel: string
  isToday: boolean
  isWeekend: boolean
  dayOff: boolean
  sections: TodoSection[]
}

export interface TodoDaily {
  focus: string
  problem: string
  positive: string
  negative: string
  notes: string
}

export interface TodoLink {
  id: string
  label: string
  url: string
}

export interface TodoWeek {
  ownerId: string
  /** Lundi de la semaine affichée. */
  weekStart: string
  days: TodoDay[]
  /** Bloc-notes de la semaine. */
  notes: string
  links: TodoLink[]
  /** Débrief du jour courant. */
  daily: TodoDaily
  today: string
  /** Bilan du jour : ce qui est coché et ce qui ne l'est pas. */
  doneToday: string[]
  pendingToday: string[]
  /** L'utilisateur peut-il écrire ? (propriétaire de la to-do, ou admin.) */
  canWrite: boolean
}
