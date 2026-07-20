// Types / forme des props de la feature « repos » (planning des jours de repos).

/** Colonnes du planning — reprend les regroupements de la Google Sheet de l'agence. */
export const REPOS_COLUMNS = [
  { key: 'g1', label: 'Carla + Alice + Julie', encadrement: false },
  { key: 'g2', label: 'Lena + Jade', encadrement: false },
  { key: 'g3', label: 'Sarah + Emma + Claire', encadrement: false },
  { key: 'g4', label: 'Lucie', encadrement: false },
  { key: 'g5', label: 'Lola + Mathilde', encadrement: false },
  { key: 'g6', label: 'Manon + Maeva', encadrement: false },
  { key: 'managers', label: 'Managers', encadrement: true },
  { key: 'policiers', label: 'Policiers', encadrement: true },
] as const

export type ReposColKey = (typeof REPOS_COLUMNS)[number]['key']

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const

export interface WeekChoice {
  start: string
  label: string
}

/** Option d'un multi-select (modèle ou chatteur). */
export interface EntityOption {
  id: string
  name: string
}

/**
 * Colonne résolue côté serveur. Le libellé d'une colonne modèle (g1…g6) est dérivé de sa compo
 * de MODÈLES (`creatorIds`) ; les colonnes encadrement gardent leur libellé fixe.
 */
export interface ReposColumn {
  key: ReposColKey
  /** Libellé de repli (encadrement, ou compo modèles vide). */
  label: string
  encadrement: boolean
  /** Modèles (creators) composant la colonne — vide pour managers/policiers. */
  creatorIds: string[]
}

/** Contenu d'une cellule : chatteurs au repos en IDs + texte libre (encadrement / legacy). */
export interface ReposCell {
  chatterIds: string[]
  names: string
}

export interface ReposData {
  /** Lundi de la semaine affichée (YYYY-MM-DD). */
  weekStart: string
  /** Libellé « Lundi 06/07 au Dimanche 12/07 ». */
  weekLabel: string
  /** Colonnes résolues (libellés/compo) — remplace l'usage direct de REPOS_COLUMNS au rendu. */
  columns: ReposColumn[]
  /** cells[day][colKey] = contenu de la cellule (IDs chatteurs + texte libre). */
  cells: Record<number, Record<string, ReposCell>>
  /** id modèle → nom : résolution des chips du header. */
  creatorById: Record<string, string>
  /** Modèles actifs — options du crayon (compo des colonnes). */
  creatorOptions: EntityOption[]
  /** id chatteur OU manager/sous-manager/police → nom : affichage des cellules (map fusionnée). */
  chatterById: Record<string, string>
  /** Chatteurs actifs — options des cellules des colonnes modèles. */
  chatterOptions: EntityOption[]
  /** Profils rôle manager (uniquement) — options de la colonne « Managers ». */
  managerOptions: EntityOption[]
  /** Profils rôle police (uniquement) — options de la colonne « Policiers ». */
  policierOptions: EntityOption[]
  sentTelegram: boolean
  /** Semaines proposées au sélecteur (récentes d'abord, inclut la prochaine). */
  weeks: WeekChoice[]
}
