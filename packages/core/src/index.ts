export * from './domain/types'
export { planAssignmentSync } from './domain/assignments'
export type { AssignmentSyncPlan } from './domain/assignments'
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
  parisDayStartUtc,
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
  frDateTimeLongParis,
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
  DEPARTURE_REASONS,
  DEPARTURE_LABEL,
  DEPARTURE_INITIATIVE,
  INITIATIVE_LABEL,
  EVENT_KINDS,
  isEventKind,
  memberEventLabel,
  memberEventOp,
} from './domain/member-events'
export type { DepartureReason, DepartureInitiative, EventKind, EventOp } from './domain/member-events'
export { POLICE_ERRORS, ERROR_LABEL } from './domain/police-errors'
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
export {
  MEDAL_OR,
  MEDAL_ARGENT,
  MEDAL_BRONZE,
  BOSS_UNLOCK_AVG,
  BOSS_PASS,
  OBJECTIVE_CAP,
  medalFor,
  bossUnlocked,
  moduleProgress,
  computeTrophies,
  effectiveStreak,
} from './training/rules'
export type { Medal, ModuleProgress, Trophy } from './training/rules'
export {
  LEVEL_XP,
  xpOf,
  xpGain,
  xpLevelOf,
  RANKS,
  rankOf,
  rankTier,
  nextRank,
  nextObjective,
  comboOf,
  COMBO_MIN,
} from './training/levels'
export type { LevelInfo, Rank, NextObjective, ObjectiveKind, ObjectiveInput } from './training/levels'
export { normalizeCite, matchMomentIndex } from './training/moments'
export {
  pickWeighted,
  lastCompletedWeek,
  wheelWeekLabel,
  WHEEL_TOP_N,
} from './training/wheel'
export type { WheelSector, WheelPrize } from './training/wheel'
export {
  pickQiQuestions,
  gradeQi,
  computeVerdict,
} from './recruit/rules'
export type {
  QiSlot,
  QiQuestion,
  RecruitConfig,
  Verdict,
} from './recruit/rules'
