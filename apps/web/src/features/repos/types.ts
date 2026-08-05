// Types / forme des props de la feature « repos » (planning des jours de repos).

/**
 * Clés possibles des colonnes MODÈLES — DYNAMIQUES depuis 0096 : une colonne n'est rendue que
 * si sa compo est non vide pour la semaine OU si ses cases de la semaine ont du contenu.
 * Vider la compo d'une colonne sans repos posés la fait donc disparaître ; « Ajouter une
 * colonne » (admin, grille) reprend la première clé libre. 30 emplacements depuis 0105 — les
 * 12 de 0096 ne couvraient plus une colonne par modèle (17 modèles actifs). Miroir de la
 * whitelist SQL de save_repos_cell.
 */
export const MODEL_COL_KEYS = [
  'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10',
  'g11', 'g12', 'g13', 'g14', 'g15', 'g16', 'g17', 'g18', 'g19', 'g20',
  'g21', 'g22', 'g23', 'g24', 'g25', 'g26', 'g27', 'g28', 'g29', 'g30',
] as const

/** Libellés legacy de la Google Sheet — fallback des colonnes historiques SANS compo datée
 *  (les semaines d'avant rest_planning_column_members doivent garder leur en-tête). */
export const LEGACY_COL_LABELS: Record<string, string> = {
  g1: 'Carla + Alice + Julie',
  g2: 'Lena + Jade',
  g3: 'Sarah + Emma + Claire',
  g4: 'Lucie',
  g5: 'Lola + Mathilde',
  g6: 'Manon + Maeva',
}

/** Colonnes ENCADREMENT — toujours rendues ; écriture régie par `encadrementRight` (RPC 0103). */
export const ENCADREMENT_COLUMNS = [
  { key: 'managers', label: 'Managers' },
  { key: 'sous-managers', label: 'Sous-managers' },
  { key: 'policiers', label: 'Policiers' },
] as const

export type ReposColKey = (typeof MODEL_COL_KEYS)[number] | (typeof ENCADREMENT_COLUMNS)[number]['key']

export type EncadrementColKey = (typeof ENCADREMENT_COLUMNS)[number]['key']

/** Une colonne d'encadrement ? (`col` arrive en `string` libre côté action.) */
export function isEncadrementCol(col: string): col is EncadrementColKey {
  return ENCADREMENT_COLUMNS.some((c) => c.key === col)
}

/** L'appelant : son id borne ses options dans une case, son rôle décide de ce qu'il peut y faire. */
export interface ReposSelf {
  id: string
  /** Rôle BRUT (`profiles.baseRole`) — c'est lui qui décide, pas une liste pré-calculée. */
  role: string
}

/**
 * Ce qu'un rôle peut faire d'une colonne d'ENCADREMENT (0103) — miroir exact de la garde SQL de
 * `save_repos_cell`, qui reste l'enforcement réel ; ceci ne fait que masquer ce qui serait de
 * toute façon refusé.
 *
 *   Colonne        | manager       | sous-manager | police
 *   ---------------|---------------|--------------|-------------
 *   Managers       | lui-même      | ✗            | ✗
 *   Sous-managers  | tout le monde | lui-même     | ✗
 *   Policiers      | tout le monde | ✗            | lui-même
 *
 * Un manager ne pose PAS un autre manager : entre pairs, chacun s'inscrit. Il place en revanche
 * librement ceux qu'il encadre.
 */
export function encadrementRight(role: string, col: EncadrementColKey): 'libre' | 'soi' | 'non' {
  if (col === 'managers') return role === 'manager' ? 'soi' : 'non'
  if (col === 'sous-managers')
    return role === 'manager' ? 'libre' : role === 'sous-manager' ? 'soi' : 'non'
  return role === 'manager' ? 'libre' : role === 'police' ? 'soi' : 'non'
}

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
  /** Colonnes résolues (libellés/compo) — modèles visibles (dynamiques) + encadrement. */
  columns: ReposColumn[]
  /** cells[day][colKey] = contenu de la cellule (IDs chatteurs + texte libre). */
  cells: Record<number, Record<string, ReposCell>>
  /** id modèle → nom : résolution des chips du header. */
  creatorById: Record<string, string>
  /** Modèles actifs — options du crayon (compo des colonnes). */
  creatorOptions: EntityOption[]
  /** id chatteur OU manager/sous-manager/police → nom : affichage des cellules (map fusionnée). */
  chatterById: Record<string, string>
  /** Drapeau « nouvel arrivant » (0101) par id de MEMBRE. Contrairement à `chatterById`, cette map
   *  ne contient QUE des profils : les fiches MyPuls legacy des cellules d'avant la bascule ne
   *  correspondent à personne dans l'équipe actuelle et n'ont donc pas de drapeau. */
  newByChatter: Record<string, { isNew: boolean; arrivedAt: string | null }>
  /** Chatteurs actifs — options des cellules des colonnes modèles. */
  chatterOptions: EntityOption[]
  /** Profils rôle manager (uniquement) — options de la colonne « Managers ». */
  managerOptions: EntityOption[]
  /** Profils rôle sous-manager (uniquement) — options de la colonne « Sous-managers ». */
  sousManagerOptions: EntityOption[]
  /** Profils rôle police (uniquement) — options de la colonne « Policiers ». */
  policierOptions: EntityOption[]
  sentTelegram: boolean
  /** Semaines proposées au sélecteur (récentes d'abord, inclut la prochaine). */
  weeks: WeekChoice[]
}
