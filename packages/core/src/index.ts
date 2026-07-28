export * from './domain/types'
export * from './impersonation/rules'
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
  WeekTracking,
} from './insights/quotas-hebdo'
export {
  isoDate,
  todayParis,
  addDays,
  mondayOf,
  frDayShort,
  frDayMonthShort,
  frDayLong,
  frWeekdayShort,
  frWeekdayLong,
  frWeekdayDate,
  frDateNumeric,
  frDateTimeParis,
  frTimeShort,
  startOfMonth,
  endOfMonth,
  addMonths,
  addMonthsSameDay,
  frMonthLong,
  daysBetween,
  weekLabel,
  currentWeekStart,
  lastWeekStart,
  lastFullWeekStartFrom,
  round1,
  round2,
} from './domain/dates'
export {
  periodOf,
  recentPeriods,
  mondaysIn,
  daysIn,
  PERIOD_ANCHOR,
  PERIOD_DAYS,
  type PayPeriod,
} from './compta/periods'
export {
  monthOf,
  monthOfPeriod,
  periodsOfMonth,
  mondaysOfMonth,
  type PayMonth,
} from './compta/months'
export { computePayslip, HANDOFF_EUR, type Payslip, type PayslipInput } from './compta/payslip'
export { rankSetters, type SetterRank, type SetterScaleRow } from './compta/setter-rank'
