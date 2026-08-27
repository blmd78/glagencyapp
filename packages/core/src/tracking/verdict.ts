import { machineBreakdown, type MachineBreakdown } from './devices'
import { attributeApps, type AppAttribution } from './focus'
import { attributeModels, type ModelAttribution } from './models'
import type { TrackerRules } from './rules'
import { DEFAULT_STALE_MS, buildSegments, liveFromEvents, summarize, type DaySummary } from './segments'
import { stagnantStretch, type StagnantStretch } from './stagnant'
import { fmtDuration, isoWeekday } from './time'
import type { LiveStatus, TrackerEvent } from './types'

/** Pause autorisée comptée dans le quota. Au-delà, la pause ne compte plus. */
export const DEFAULT_PAUSE_ALLOWANCE_MINUTES = 60

export interface TrackerVerdictInput {
  events: TrackerEvent[]
  windowStart: number
  windowEnd: number
  /** Date Paris servant à juger le jour travaillé. */
  queryDate: string
  quotaMinutes: number
  /** Jours ISO travaillés, ex. « 1,2,3,4,5 ». */
  workdays: string
  rules: TrackerRules
  now?: number
  staleMs?: number
  pauseAllowanceMinutes?: number
  /** Rapport JOURNÉE : un jour non travaillé est conforme d'office. Rapport SHIFT : non. */
  gateWorkday?: boolean
}

export interface TrackerVerdict extends DaySummary {
  quotaMinutes: number
  missingMinutes: number
  countedPauseMinutes: number
  effectiveMinutes: number
  pauseAllowanceMinutes: number
  offTaskOver: boolean
  isWorkday: boolean
  compliant: boolean
  reasons: string[]
  apps: AppAttribution
  models: ModelAttribution
  devices: MachineBreakdown
  stagnant: StagnantStretch
  stagnantOver: boolean
  live: LiveStatus | null
}

export function computeWindowVerdict(input: TrackerVerdictInput): TrackerVerdict {
  const {
    events, windowStart, windowEnd, queryDate, quotaMinutes, workdays, rules,
    now = Date.now(),
    staleMs = DEFAULT_STALE_MS,
    pauseAllowanceMinutes = DEFAULT_PAUSE_ALLOWANCE_MINUTES,
    gateWorkday = false,
  } = input

  const built = buildSegments(events, { now, staleMs })
  const sum = summarize(built, windowStart, windowEnd)
  const apps = attributeApps(built, events, windowStart, windowEnd, rules)
  const models = attributeModels(built, events, windowStart, windowEnd)

  // Postes utilisés : sert uniquement à lever une alerte. On ne corrige AUCUN chiffre — un chatter
  // sur deux PC est un cas à régler avec lui, pas à rattraper par un calcul.
  const devices = machineBreakdown(events, windowStart, windowEnd, now, staleMs)

  // Écran figé : signalé sans rien recalculer — c'est un cas à vérifier, pas une règle automatique.
  const stagnant = stagnantStretch(built, events, windowStart, windowEnd)
  const stagnantOver = stagnant.tracked && stagnant.minutes >= rules.stagnantThresholdMinutes

  const isWorkday = workdays.split(',').map(Number).includes(isoWeekday(queryDate))

  // La pause compte dans le quota, mais plafonnée.
  const countedPause = Math.min(sum.pauseMinutes, pauseAllowanceMinutes)
  const effectiveMinutes = sum.activeMinutes + countedPause
  const missing = Math.max(0, quotaMinutes - effectiveMinutes)
  const offTaskOver = apps.offTaskMinutes > rules.offTaskThresholdMinutes

  const reasons: string[] = []
  if (!sum.launched) reasons.push("n'a jamais lancé l'app")
  else if (missing > 0) reasons.push(`${fmtDuration(missing)} manquantes`)
  if (offTaskOver) reasons.push(`${fmtDuration(apps.offTaskMinutes)} hors whitelist`)
  if (sum.pauseMinutes > pauseAllowanceMinutes) {
    reasons.push(`pause ${fmtDuration(sum.pauseMinutes)} (max ${fmtDuration(pauseAllowanceMinutes)})`)
  }
  if (sum.crashed) reasons.push('app fermée / PC éteint')

  const okMetrics = missing === 0 && !sum.crashed && !offTaskOver

  return {
    ...sum,
    quotaMinutes,
    missingMinutes: missing,
    countedPauseMinutes: countedPause,
    effectiveMinutes,
    pauseAllowanceMinutes,
    offTaskOver,
    isWorkday,
    compliant: gateWorkday ? !isWorkday || okMetrics : okMetrics,
    reasons,
    apps,
    models,
    devices,
    stagnant,
    stagnantOver,
    live: liveFromEvents(events, now, staleMs),
  }
}
