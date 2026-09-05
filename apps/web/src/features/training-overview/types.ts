import type { CaseKind } from '@/lib/types/training'

/**
 * Vocabulaire de l'Overview encadrant (droit `frm-suivi`) : le roster des chatters en
 * formation, la fiche d'un chatter, les notes contestées et le coût IA (admin).
 * AUCUN secret de cas ne transite : titres, notes et agrégats seulement.
 */

export interface RosterRow {
  profileId: string
  displayName: string
  isNew: boolean
  arrivedAt: string | null
  models: string[]
  casesDone: number
  avgTotal: number | null
  points: number
  bossBest: number | null
  bossDone: boolean
  /** Série EFFECTIVE (0 si le dernier jour actif est antérieur à hier Paris) — calculée par la RPC 0119. */
  streakDays: number
  lastSessionAt: string | null
  sessionsScored: number
  /**
   * EN FORMATION (`profiles.in_training`, 0147) — décide de l'onglet où la ligne apparaît. C'est
   * un DRAPEAU, plus une déduction : jusqu'ici la coupure se faisait sur `models.length === 0`,
   * qui ne tenait que parce que le bouton « Intégrer » rattachait une modèle dans le même geste.
   */
  inTraining: boolean
  /** A le droit `frm-entrainement`. Faux = intégré mais sans accès à l'entraînement → badge. */
  hasTraining: boolean
}

export interface ReportRow {
  id: string
  sessionId: string
  profileId: string
  displayName: string
  message: string
  createdAt: string
  resolvedAt: string | null
  caseTitle: string
  total: number | null
}

/** Fenêtre du suivi de coût IA (jours) — le service borne la RPC, l'encart l'affiche. */
export const COST_WINDOW_DAYS = 30

export interface CostRow {
  day: string
  model: string
  kind: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface OverviewData {
  roster: RosterRow[]
  reports: ReportRow[]
  /** null pour un non-admin : la RLS de `training_ai_calls` est admin-only, on n'appelle même pas la RPC. */
  cost: { rows: CostRow[]; estimatedUsd: number } | null
  totalCases: number
}

/**
 * Fiche d'un chatter. PAS de `displayName` ici : il vit déjà dans le roster (lu en parallèle
 * par la page) — le faire re-résoudre par ce service ajouterait une requête pour un champ
 * que la Template a sous la main.
 */
/**
 * Un cas du catalogue, vu depuis la fiche d'un chatter. `bestTotal` null = JAMAIS TENTÉ — c'est
 * l'information la plus utile de l'écran (le trou dans le parcours), elle ne pouvait pas s'écrire
 * tant que la fiche ne listait que `training_case_bests`.
 */
export interface CaseProgress {
  caseId: string
  title: string
  kind: CaseKind
  /** 1 → 10, l'échelle de `training_cases.difficulty` : le « niveau » d'un module. */
  difficulty: number
  bestTotal: number | null
  attempts: number
  lastAt: string | null
}

/** Une compétence (`training_module_sections`) ou, pour un module sans compétence, son seul groupe. */
export interface CaseGroup {
  /** null = le groupe implicite d'un module sans compétence (ou les cas hors compétence). */
  id: string | null
  title: string
  avg: number | null
  attempted: number
  total: number
  cases: CaseProgress[]
}

export interface ModuleProgress {
  code: string
  title: string
  emoji: string | null
  avg: number | null
  attempted: number
  total: number
  /** Un seul groupe à `id: null` = le module n'a pas de compétences → un niveau de dépliage en moins. */
  groups: CaseGroup[]
}

export interface ChatterDetail {
  profileId: string
  /** Le CATALOGUE entier croisé avec ses meilleures notes — modules dans l'ordre du catalogue. */
  modules: ModuleProgress[]
  sessions: {
    id: string
    caseTitle: string
    kind: CaseKind
    status: string
    total: number | null
    startedAt: string
  }[]
  axes: { key: string; name: string; avg: number; n: number }[]
}
