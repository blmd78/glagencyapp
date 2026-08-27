import {
  addDays,
  attributeApps,
  attributeModels,
  buildSegments,
  computeWindowVerdict,
  dayBounds,
  isoWeekday,
} from '@glagency/core'
import { readTrackerWindow } from '@/lib/tracking/window'
import type { ChatterData, PeriodTotals } from '../types'

const EMPTY: PeriodTotals = {
  workedDays: 0,
  compliantDays: 0,
  effectiveMinutes: 0,
  activeMinutes: 0,
  countedPauseMinutes: 0,
  idleMinutes: 0,
  offTaskMinutes: 0,
}

/**
 * La fiche d'un chatteur : cumuls de la semaine et du mois, sites et modèles du mois.
 *
 * ⚠️ ÉCART ASSUMÉ AU PLAN. Celui-ci prévoyait de lire les tables de faits
 * (`tracker_shift_rows`…) ; elles sont VIDES tant que le job de fin de shift n'existe pas
 * (incrément 4). Un écran qui afficherait zéro en permanence ne se vérifie pas et ne rend service
 * à personne : on recalcule donc depuis les événements bruts, comme le board. Le volume le permet
 * — un seul chatteur sur un mois. À rebrancher sur les faits dès qu'ils existent.
 *
 * Les totaux sont des sommes de verdicts JOURNALIERS et non le verdict d'une longue fenêtre :
 * « 0/3 jours conformes » n'a de sens que jour par jour, et le quota comme le plafond de pause
 * s'appliquent par journée.
 */
export async function getChatterPeriods(profileId: string, now = Date.now()): Promise<ChatterData> {
  const today = parisDay(now)
  const monthStart = `${today.slice(0, 7)}-01`
  // Lundi de la semaine en cours (`isoWeekday` : 1 = lundi).
  const weekStart = addDays(today, -(isoWeekday(today) - 1))

  const from = dayBounds(monthStart).start
  const to = Math.min(dayBounds(today).end, now)

  const { people, rules } = await readTrackerWindow({ from, to, profileId })
  const person = people[0]
  if (!person) {
    return { profileId, name: 'Inconnu', week: EMPTY, month: EMPTY, sites: [], models: [] }
  }

  const days: string[] = []
  for (let d = monthStart; d <= today; d = addDays(d, 1)) days.push(d)

  const week = { ...EMPTY }
  const month = { ...EMPTY }

  for (const day of days) {
    const bounds = dayBounds(day)
    const verdict = computeWindowVerdict({
      events: person.events,
      windowStart: bounds.start,
      windowEnd: bounds.end,
      queryDate: day,
      quotaMinutes: person.quotaMinutes,
      workdays: person.workdays,
      rules,
      now,
      // Rapport JOURNÉE : un jour non travaillé est conforme d'office (contrat du domaine).
      gateWorkday: true,
    })
    if (!verdict.launched) continue

    for (const acc of day >= weekStart ? [week, month] : [month]) {
      acc.workedDays += 1
      acc.compliantDays += verdict.compliant ? 1 : 0
      acc.effectiveMinutes += verdict.effectiveMinutes
      acc.activeMinutes += verdict.activeMinutes
      acc.countedPauseMinutes += verdict.countedPauseMinutes
      acc.idleMinutes += verdict.idleMinutes
      acc.offTaskMinutes += verdict.apps.offTaskMinutes
    }
  }

  // Sites et modèles : une seule attribution sur TOUT le mois, pas une somme de journées — sommer
  // des minutes arrondies jour par jour dériverait de plusieurs minutes sur un mois.
  const built = buildSegments(person.events, { now })
  const apps = attributeApps(built, person.events, from, to, rules)
  const models = attributeModels(built, person.events, from, to)

  return {
    profileId,
    name: person.name,
    week,
    month,
    sites: apps.items,
    models: models.perModel,
  }
}

const parisDay = (ms: number): string =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(ms))
