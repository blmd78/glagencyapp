export * from './domain/types'
export { summarizeRun } from './ingest/run-summary'
export type { IngestDayResult, IngestRunSummary } from './ingest/run-summary'
export { runRules } from './insights/engine'
export type { InsightContext } from './insights/engine'
export type { Rule } from './insights/rules'
export { buildQuotaInsights, levelOf } from './insights/quotas-hebdo'
export type {
  DailyCa,
  QuotaTargets,
  ChatterDayInput,
  ChatterModelDayInput,
  WeekWindow,
  QuotaInsightsInput,
  InsightKpi,
  InsightModelSplit,
  InsightDraft,
} from './insights/quotas-hebdo'
