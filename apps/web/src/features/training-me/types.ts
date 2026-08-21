import type { Medal, ModuleProgress, Trophy } from '@glagency/core'
import type { CaseKind } from '@/lib/types/training'

/**
 * « Ma formation » — la progression du VISITEUR (jamais celle d'un autre : chaque requête filtre
 * sur son `profile_id`). Aucun secret de cas ne transite : titres, notes et agrégats seulement.
 */
export interface MeStats {
  casesDone: number
  avgTotal: number | null
  points: number
  bossBest: number | null
  bossDone: boolean
  streakDays: number
  activeDays: number
  lastSessionAt: string | null
}

export interface MeCase {
  id: string
  title: string
  kind: CaseKind
  best: number | null
  medal: Medal | null
  attempts: number
}

export interface MeModule {
  id: string
  code: string
  title: string
  emoji: string | null
  progress: ModuleProgress
  cases: MeCase[]
}

export interface MeSession {
  id: string
  caseId: string
  caseTitle: string
  kind: CaseKind
  status: string
  total: number | null
  objectiveReached: boolean | null
  startedAt: string
  moduleTitle: string
}

export interface RankRow {
  profileId: string
  displayName: string
  points: number
  casesDone: number
  avgTotal: number | null
  bossDone: boolean
  streakDays: number
  isNew: boolean
}

/** Classement HEBDO (RPC `training_weekly_ranking`) : mêmes agrégats que `RankRow`, sans boss ni série. */
export type WeeklyRankRow = Pick<RankRow, 'profileId' | 'displayName' | 'points' | 'casesDone' | 'avgTotal'>

/**
 * `semaine` = semaine en cours (lundi courant) ; `semaine-derniere` = dernière semaine COMPLÈTE —
 * celle qui détermine les tickets de roue (`training_last_week()`, migration 0113_formation) ; `global` =
 * classement toutes périodes (`training_ranking`).
 */
export type RankScope = 'semaine' | 'semaine-derniere' | 'global'

export interface MeData {
  stats: MeStats
  modules: MeModule[]
  active: MeSession | null
  /** « Reprendre où j'en étais » : 1er cas non validé du 1er module incomplet, null si tout est fait. */
  nextCaseId: string | null
  history: MeSession[]
  trophies: Trophy[]
  /** Scope actuellement chargé — UNE seule RPC de classement par requête (jamais les deux). */
  rankingScope: RankScope
  /** Classement global : peuplé seulement quand `rankingScope === 'global'`, `[]` sinon. */
  ranking: RankRow[]
  /** Classement hebdo : peuplé seulement quand `rankingScope !== 'global'`, `null` sinon. */
  weeklyRanking: WeeklyRankRow[] | null
  /** Rang du visiteur dans la vue COURANTE (`rankingScope`), pas toujours le classement global. */
  myRank: number | null
  /** Dénominateur AFFICHÉ des cas validés : catalogue actif hors boss, jamais inférieur à `stats.casesDone`. */
  totalCases: number
  goldCount: number
  bossUnlocked: boolean
}

export type MeVue = 'progression' | 'historique' | 'classement'
