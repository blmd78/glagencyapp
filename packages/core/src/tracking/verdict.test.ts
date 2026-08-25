import { describe, expect, it } from 'vitest'
import { normalizeRules } from './rules'
import { computeWindowVerdict } from './verdict'
import type { TrackerEvent } from './types'

// 05h00 Paris le mardi 25/08 (isoWeekday 2, donc dans « 1,2,3,4,5 »).
const T0 = Date.parse('2026-08-25T03:00:00Z')
const min = (n: number): number => n * 60_000
const at = (offsetMin: number): string => new Date(T0 + min(offsetMin)).toISOString()
const rules = normalizeRules({ apps: ['chrome'], domains: ['mypuls.app'] })

const base = {
  windowStart: T0,
  windowEnd: T0 + min(480),
  queryDate: '2026-08-25',
  quotaMinutes: 480,
  workdays: '1,2,3,4,5',
  rules,
  now: T0 + min(600),
}

describe('computeWindowVerdict', () => {
  it('quota atteint, tout sur la liste blanche → conforme', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'focus', at: at(0), meta: { app: 'chrome', host: 'mypuls.app' } },
      { type: 'shift_end', at: at(480) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.activeMinutes).toBe(480)
    expect(v.missingMinutes).toBe(0)
    expect(v.compliant).toBe(true)
    expect(v.reasons).toEqual([])
  })

  it('quota non atteint → motif « N manquantes »', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'shift_end', at: at(400) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.missingMinutes).toBe(80)
    expect(v.compliant).toBe(false)
    expect(v.reasons).toContain('1h20 manquantes')
  })

  it('app jamais lancée → motif dédié', () => {
    const v = computeWindowVerdict({ ...base, events: [] })
    expect(v.launched).toBe(false)
    expect(v.reasons).toContain("n'a jamais lancé l'app")
    expect(v.compliant).toBe(false)
  })

  it('la pause compte dans le quota, mais plafonnée à 60 min', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'pause', at: at(300) },
      { type: 'resume', at: at(420) },   // 120 min de pause
      { type: 'shift_end', at: at(480) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.pauseMinutes).toBe(120)
    expect(v.countedPauseMinutes).toBe(60)          // plafonné
    expect(v.effectiveMinutes).toBe(360 + 60)       // 360 actives + 60 comptées
    expect(v.reasons).toContain('pause 2h00 (max 1h00)')
    expect(v.compliant).toBe(false)
  })

  it('hors-tâche au-delà du seuil → non conforme', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'focus', at: at(0), meta: { app: 'chrome', host: 'youtube.com' } },
      { type: 'focus', at: at(40), meta: { app: 'chrome', host: 'mypuls.app' } },
      { type: 'shift_end', at: at(480) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.apps.offTaskMinutes).toBe(40)
    expect(v.offTaskOver).toBe(true)                // seuil par défaut = 30
    expect(v.compliant).toBe(false)
    expect(v.reasons).toContain('40min hors whitelist')
  })

  it('gateWorkday : un jour non travaillé est conforme d’office', () => {
    // 2026-08-30 est un dimanche (isoWeekday 7), hors '1,2,3,4,5'
    const v = computeWindowVerdict({
      ...base, events: [], queryDate: '2026-08-30', gateWorkday: true,
    })
    expect(v.isWorkday).toBe(false)
    expect(v.compliant).toBe(true)
  })

  it('sans gateWorkday, le même jour reste non conforme', () => {
    const v = computeWindowVerdict({
      ...base, events: [], queryDate: '2026-08-30', gateWorkday: false,
    })
    expect(v.compliant).toBe(false)
  })

  it('PC éteint en cours de shift → motif « app fermée / PC éteint »', () => {
    // Le dernier battement doit tomber STRICTEMENT dans la fenêtre : `summarize` teste
    // `t < dayEnd`, donc un arrêt pile sur la borne de fin ne lèverait pas le drapeau.
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'heartbeat', at: at(400) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.crashed).toBe(true)
    expect(v.activeMinutes).toBe(400)
    expect(v.reasons).toContain('app fermée / PC éteint')
  })

  it('PC éteint alors que le quota est DÉJÀ atteint → non conforme quand même', () => {
    // Isole le terme `!crashed` de la formule : ici `missing` vaut 0, donc si `crashed` sautait
    // de `compliant`, la personne serait blanchie malgré un arrêt anormal.
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'heartbeat', at: at(400) },
    ]
    const v = computeWindowVerdict({ ...base, events, quotaMinutes: 390 })
    expect(v.activeMinutes).toBe(400)
    expect(v.missingMinutes).toBe(0)
    expect(v.crashed).toBe(true)
    expect(v.compliant).toBe(false)
  })

  it('pause de 60 min PILE : dans les clous, aucun motif', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'pause', at: at(300) },
      { type: 'resume', at: at(360) },   // exactement 60 min
      { type: 'shift_end', at: at(480) },
    ]
    const v = computeWindowVerdict({ ...base, events })
    expect(v.pauseMinutes).toBe(60)
    expect(v.countedPauseMinutes).toBe(60)
    expect(v.effectiveMinutes).toBe(480)
    expect(v.reasons).toEqual([])
    expect(v.compliant).toBe(true)
  })
})
