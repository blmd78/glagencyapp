import type { InsightKpi, InsightModelSplit } from '@glagency/core'
export type { InsightKpi, InsightModelSplit }

/** Contrat de la page Insights — cartes hebdo « quotas » (dernière génération par clé). */

export type InsightStatus = 'new' | 'in_progress' | 'resolved' | 'ignored'

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
}

export interface InsightsData {
  /** Lundi de la semaine évaluée (null si aucune carte). */
  weekStart: string | null
  insights: InsightRow[]
}
