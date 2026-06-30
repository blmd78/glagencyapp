// Modèles de domaine (purs, sans dépendance à Supabase ni au réseau).

export type ISODate = string // 'YYYY-MM-DD'
export interface Period {
  start: ISODate
  end: ISODate
}

export type ChatterRole = 'setter' | 'closer' | 'sous_manager' | 'volant' | 'trainee'

export interface Chatter {
  id: string
  name: string
  email: string | null
  team: string | null
  role: ChatterRole | null
  active: boolean
}

export interface ChatterMetrics {
  ca: number
  caPpv: number
  caTips: number
  propose: number
  vendu: number
  tauxConv: number | null
}

export type InsightScope = 'month' | 'week' | 'day'
export type InsightSeverity =
  | 'critical'
  | 'warning'
  | 'opportunity'
  | 'insight'
  | 'notable'
  | 'ok'

export interface Insight {
  id: string
  scope: InsightScope
  team: string | null
  severity: InsightSeverity
  category: string
  title: string
  body?: string
  recommendation?: string
  icon?: string
  dataPoints?: Record<string, unknown>
  period: Period
}
