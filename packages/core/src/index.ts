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
// --- Tracker de présence (incrément 1) -------------------------------------
export type {
  TrackerEventType,
  TrackerEvent,
  SegmentKind,
  Segment,
  BuiltSegments,
  LiveState,
  LiveStatus,
} from './tracking/types'
export {
  parisOffsetMs,
  parisWallUtcMs,
  parisDay,
  dayBounds,
  isoWeekday,
  fmtClock,
  fmtDuration,
} from './tracking/time'
export { SHIFTS, BOUNDARIES, shiftByKey, shiftWindow, shiftWindowOn, currentShift } from './tracking/shifts'
export type { Shift, ShiftKey, ShiftWindow } from './tracking/shifts'
export {
  DEFAULT_STALE_MS,
  buildSegments,
  liveFromEvents,
  summarize,
} from './tracking/segments'
export type { DaySummary } from './tracking/segments'
export { DEFAULT_RULES, normalizeRules, isAllowedApp, isAllowedDomain } from './tracking/rules'
export type { RawRules, TrackerRules } from './tracking/rules'
export { normalizeUrl, attributeApps } from './tracking/focus'
export type { AppItem, AppAttribution } from './tracking/focus'
export { attributeModels, modelKey } from './tracking/models'
export type { ModelTime, ModelAttribution } from './tracking/models'
export { stagnantStretch } from './tracking/stagnant'
export type { StagnantStretch } from './tracking/stagnant'
export { OVERLAP_ALERT_MINUTES, machineBreakdown } from './tracking/devices'
export type { MachineSlice, MachineBreakdown } from './tracking/devices'
export { DEFAULT_PAUSE_ALLOWANCE_MINUTES, computeWindowVerdict } from './tracking/verdict'
export type { TrackerVerdictInput, TrackerVerdict } from './tracking/verdict'
export { managerDay, sumManagerDays } from './tracking/manager-day'
export type { ManagerDay, ManagerSpan, ManagerCumul } from './tracking/manager-day'

// Contrôle des shifts MyPuls (0138) — le temps de chatting réel, mesuré sans agent sur le poste.
// Vocabulaire CRM (`soir`), volontairement distinct de `tracking/shifts` qui dit `nuit`.
export { SLOT_KEYS, SLOT_LABEL, SLOT_START_HOUR, slotOf, held, hoursOf } from './mypuls-shifts/slots'
export type { SlotKey } from './mypuls-shifts/slots'
export { groupIntoVacations, groupVacationsAt, segmentBounds } from './mypuls-shifts/vacations'
export type {
  MypulsSegment,
  MypulsSegmentAt,
  MypulsSegmentModel,
  MypulsVacation,
} from './mypuls-shifts/vacations'
export { dayKpi } from './mypuls-shifts/kpi'
export type { MypulsDayKpi, MypulsCoverageRow } from './mypuls-shifts/kpi'
