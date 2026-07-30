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
  frDayMonthParis,
  frTimeShort,
  startOfMonth,
  endOfMonth,
  addMonths,
  addMonthsSameDay,
  frMonthLong,
  daysBetween,
  daysBetweenParis,
  weekLabel,
  currentWeekStart,
  lastWeekStart,
  lastFullWeekStartFrom,
  round1,
  round2,
} from './domain/dates'
export { NEW_THRESHOLD_DAYS, daysSinceArrival, isStaleNew } from './domain/anciennete'
export { tenureDays, turnoverRate } from './domain/turnover'
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
export {
  computePayslip,
  HANDOFF_EUR,
  type Payslip,
  type PayslipInput,
  type PayslipModelLine,
  type PayslipSegment,
  type RateSegmentInput,
} from './compta/payslip'
export {
  rateSpans,
  rateOn,
  DEFAULT_RATE,
  type RateChange,
  type RateSpan,
} from './compta/rates'
export { rankSetters, type SetterRank, type SetterScaleRow } from './compta/setter-rank'
