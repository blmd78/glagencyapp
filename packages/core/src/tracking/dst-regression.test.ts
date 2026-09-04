import { describe, expect, it } from 'vitest'
import { parisOffsetMs } from './time'

/**
 * NON-RÉGRESSION de la mémoïsation à l'heure de `parisOffsetMs`.
 *
 * La mémoïsation (nécessaire pour tenir dans les 10 ms de CPU du Worker : ~25 000 conversions
 * par nuit d'ingestion) suppose que le décalage Paris↔UTC est CONSTANT à l'intérieur d'une heure
 * UTC. C'est vrai parce que les transitions européennes tombent pile à 01:00 UTC — mais c'est
 * une hypothèse, et ce test la vérifie contre l'implémentation d'origine sur deux ans complets,
 * soit les quatre bascules encadrées de près.
 */
function original(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - at.getTime()
}

describe('parisOffsetMs — mémoïsation', () => {
  it('donne le MÊME décalage que l’implémentation d’origine, toutes les 10 min sur 2 ans', () => {
    const bad: string[] = []
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 10 * 60_000) {
      const d = new Date(t)
      if (parisOffsetMs(d) !== original(d)) bad.push(d.toISOString())
    }
    expect(bad).toEqual([])
  })

  it('reste juste à la minute AUTOUR des transitions (chaque minute, ±2 h)', () => {
    // 2026-03-29 01:00 UTC (hiver→été) et 2026-10-25 01:00 UTC (été→hiver).
    for (const pivot of [Date.UTC(2026, 2, 29, 1), Date.UTC(2026, 9, 25, 1)]) {
      for (let t = pivot - 2 * 3_600_000; t <= pivot + 2 * 3_600_000; t += 60_000) {
        const d = new Date(t)
        expect(parisOffsetMs(d), d.toISOString()).toBe(original(d))
      }
    }
  })
})
