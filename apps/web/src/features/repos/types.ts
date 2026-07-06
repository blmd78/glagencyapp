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

export interface ReposData {
  /** Lundi de la semaine affichée (YYYY-MM-DD). */
  weekStart: string
  /** Libellé « Lundi 06/07 au Dimanche 12/07 ». */
  weekLabel: string
  /** cells[day][colKey] = prénoms (texte libre, vide si non rempli). */
  cells: Record<number, Record<string, string>>
  sentTelegram: boolean
  /** Semaines proposées au sélecteur (récentes d'abord, inclut la prochaine). */
  weeks: WeekChoice[]
  /** Chatteurs actifs (noms) — options du multi-select des cellules. */
  chatterNames: string[]
  /** nom → team_id : sert à la règle « rouge si > 2 repos dans la MÊME équipe ». */
  chatterTeams: Record<string, string>
}
