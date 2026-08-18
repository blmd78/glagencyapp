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

export interface MeData {
  stats: MeStats
  modules: MeModule[]
  active: MeSession | null
  history: MeSession[]
  trophies: Trophy[]
  ranking: RankRow[]
  myRank: number | null
  totalCases: number
  goldCount: number
  bossUnlocked: boolean
}

export type MeVue = 'progression' | 'historique' | 'classement'
