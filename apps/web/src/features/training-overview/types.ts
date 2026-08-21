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
export interface ChatterDetail {
  profileId: string
  bests: {
    caseId: string
    caseTitle: string
    moduleTitle: string
    /** Code du module (`/formation/modules/<code>`) — le lien de la fiche pointe vers le module du cas. */
    moduleCode: string
    kind: CaseKind
    bestTotal: number
    attempts: number
    lastAt: string
  }[]
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
