/** Une ligne de la liste « Suivi chatters ». */
export interface CoachingRow {
  profileId: string
  name: string
  models: string[]
  /** Moyenne des sessions notées, sur 20. `null` = jamais noté. */
  score: number | null
  sessions: number
  /** Date du dernier 1:1 (`YYYY-MM-DD`), `null` si jamais vu. */
  lastSeen: string | null
  /** Jours depuis le dernier 1:1 ; `null` si jamais vu — c'est le tri par défaut. */
  gapDays: number | null
}

export interface SkillRating {
  id: string
  stars: number
  comment: string
  author: string
  date: string
}

export interface Skill {
  id: string
  name: string
  description: string
  /** Note la plus récente — l'historique ne s'écrase jamais. */
  current: number | null
  history: SkillRating[]
}

export interface CoachingSession {
  id: string
  date: string
  score: number | null
  summary: string
  general: string
  author: string
}

export interface CoachingNote {
  id: string
  body: string
  author: string
  date: string
}

export interface ChatterCoaching {
  profileId: string
  name: string
  models: string[]
  /** Moyenne des sessions notées, sur 20. */
  average: number | null
  scoredSessions: number
  totalSessions: number
  lastSessionDate: string | null
  gapDays: number | null
  skills: Skill[]
  sessions: CoachingSession[]
  notes: CoachingNote[]
  canWrite: boolean
}
