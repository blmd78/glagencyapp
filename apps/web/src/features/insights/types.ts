import type { InsightKpi, InsightModelSplit, WeekTracking } from '@glagency/core'
export type { InsightKpi, InsightModelSplit, WeekTracking }

/** Contrat de la page Insights — cartes hebdo « quotas » (dernière génération par clé). */

export type InsightStatus = 'new' | 'in_progress' | 'resolved' | 'ignored'

/** Bilan structuré de résolution (modal repris du CRM legacy). */
export interface InsightBilan {
  date: string
  duree: '5min' | '15min' | '30min' | '1h+'
  etat: 'neutre' | 'motive' | 'fatigue' | 'demotive' | 'resistant'
  resume: string
  actions: string
  objectifs: string
  sanction: string
  nextCheck: string
  notes: string
}

export interface InsightRow {
  key: string
  weekStart: string
  severity: 'critical' | 'warning' | 'ok'
  title: string
  body: string
  actionPlan: string
  kpis: InsightKpi[]
  models: InsightModelSplit[]
  generatedAt: string
  status: InsightStatus
  note: string | null
  bilan: InsightBilan | null
  week: WeekTracking | null
  updatedAt: string | null
  updatedBy: string | null
  updatedByName: string | null
}

export interface InsightsData {
  /** Lundi de la semaine évaluée (null si aucune carte). */
  weekStart: string | null
  insights: InsightRow[]
}

/** Une ligne du classement global (métriques agrégées sur la semaine des insights). */
export interface RankingRow {
  chatterId: string
  chatterName: string
  ca: number
  presenceH: number
  propose: number
  convPct: number | null // null si propose = 0
  reactSec: number | null // null si aucune journée mesurée
}

export interface RankingData {
  weekStart: string
  rows: RankingRow[]
}
