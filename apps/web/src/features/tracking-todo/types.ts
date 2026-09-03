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
  /**
   * Déposée par CELUI QUI REGARDE. C'est la seule tâche qu'un non-titulaire puisse retirer
   * (`assertCanUnassign` : « retirer ce qu'il a déposé ») — sans ce drapeau, la dérogation
   * existerait côté serveur sans aucun bouton pour l'exercer, comme c'était le cas du dépôt.
   */
  depositedByMe: boolean
  /**
   * Tâche « 1:1 » : l'id du chatteur visé. Cocher n'est alors pas une case à cocher — ça ouvre le
   * bilan sur sa fiche, et c'est l'enregistrement du bilan qui clôt la tâche.
   */
  chatterId: string | null
  /**
   * Le 1:1 a rendu son bilan (`session_id` posé, 0133). La tâche devient alors INTOUCHABLE : ni
   * décochée, ni supprimée — sa session vivrait sinon dans la fiche du chatteur sans plus rien
   * pour la rattacher, et refaire le 1:1 en créerait une seconde. On passe par la suppression du
   * bilan, qui rouvre la tâche (`deleteSession`).
   */
  hasBilan: boolean
  /** Nom du chatteur visé, pour l'afficher sur la tâche. */
  chatterName: string | null
}

/** Une habitude : le gabarit qui crée sa tâche chaque jour choisi. */
export interface TodoHabit {
  id: string
  label: string
  category: string
  /** Jours ISO (1 = lundi … 7 = dimanche). */
  weekdays: number[]
  active: boolean
}

/** Un chatteur proposable dans « Session 1:1 avec » — borné au périmètre de l'appelant. */
export interface TodoChatter {
  id: string
  name: string
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
  /**
   * L'appelant peut DÉPOSER (et retirer) une tâche sur cette semaine sans en être le titulaire.
   * C'est la seule dérogation de l'admin : il ne coche pas, ne déplace pas, ne débriefe pas.
   * Sans ce drapeau, sa dérogation existait côté serveur mais aucun bouton ne l'exerçait.
   */
  canAssign: boolean
  /** Les habitudes du titulaire, pour le panneau de gestion. */
  habits: TodoHabit[]
  /** Les chatteurs que l'appelant peut viser par un 1:1. */
  chatters: TodoChatter[]
  ownerId: string
  /** Lundi de la semaine affichée. */
  weekStart: string
  days: TodoDay[]
  /** Bloc-notes de la semaine. */
  notes: string
  links: TodoLink[]
  /**
   * Les débriefs de la semaine affichée, par jour (`YYYY-MM-DD`) — un jour sans ligne est absent.
   * La carte « Bilan du jour » laisse CHOISIR le jour : celui qui finit son service après minuit
   * débriefe la journée qu'il vient de faire, pas celle qui commence. Vide sur la semaine d'un
   * autre (RLS 0132), sauf pour l'admin.
   */
  dailyByDay: Record<string, TodoDaily>
  /**
   * Jour civil Paris du rendu — sert au lien « cette semaine » de la page et à griser les jours à
   * venir du sélecteur ; la colonne, elle, se surligne via `TodoDay.isToday`, calculé à partir de
   * lui dans le service.
   */
  today: string
  /** Jour proposé d'office dans la carte « Bilan du jour » (`defaultDebriefDay`). */
  debriefDay: string
  /** L'utilisateur peut-il écrire ? (titulaire de la to-do, ET rôle d'encadrement.) */
  canWrite: boolean
  /**
   * Le débrief du jour et le bloc-notes de la semaine sont-ils LISIBLES ? Faux pour un manager sur
   * la semaine d'un sous-manager : la RLS (0132 / 0137) réserve ce journal à son auteur et aux
   * admins, il remonterait donc vide. On l'affiche alors comme masqué, jamais comme « à remplir ».
   */
  journalLisible: boolean
}
