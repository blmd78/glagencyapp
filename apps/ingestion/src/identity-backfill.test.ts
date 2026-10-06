import { describe, expect, it } from 'vitest'
import { nightlyWindow, nightlyWindowStartedBetween } from './identity-backfill'

// Fenêtres d'ingestion nocturne (UTC) où un `--apply` ne démarre pas : 22:55 → 00:20 et 04:20 → 05:30,
// bornes comprises à la minute. Une fusion pendant un run fausserait ses contrôles.

const at = (iso: string) => new Date(`${iso}Z`)
const SOIR = '22:55 → 00:20 UTC (crons de 23:05 et 00:00)'
const MATIN = '04:20 → 05:30 UTC (crons de 04:30 et 05:00)'

describe('nightlyWindow — bornes à la minute', () => {
  it.each<[string, string | null]>([
    ['2026-10-05T22:54:59', null],
    ['2026-10-05T22:55:00', SOIR],
    ['2026-10-05T23:59:59', SOIR],
    ['2026-10-06T00:00:00', SOIR],
    ['2026-10-06T00:20:59', SOIR],
    ['2026-10-06T00:21:00', null],
    ['2026-10-06T04:19:59', null],
    ['2026-10-06T04:20:00', MATIN],
    ['2026-10-06T05:30:59', MATIN],
    ['2026-10-06T05:31:00', null],
    ['2026-10-06T12:00:00', null],
  ])('%s UTC → %s', (iso, expected) => {
    expect(nightlyWindow(at(iso))).toBe(expected)
  })
})

describe('nightlyWindowStartedBetween — une fenêtre a-t-elle DÉMARRÉ dans ]from, to] ?', () => {
  it('début de fenêtre exactement à `to` → compté (borne haute incluse)', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T22:54:59.999'), at('2026-10-05T22:55:00'))).toBe(SOIR)
  })

  it('début de fenêtre exactement à `from` → non compté (borne basse exclue)', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T22:55:00'), at('2026-10-05T23:30:00'))).toBeNull()
  })

  it('faits lus avant une fenêtre déjà FINIE au lancement → périmés quand même', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T21:00:00'), at('2026-10-06T01:00:00'))).toBe(SOIR)
  })

  it('d’un jour sur l’autre : la fenêtre du matin du lendemain est vue', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-05T23:00:00'), at('2026-10-06T04:19:59'))).toBeNull()
    expect(nightlyWindowStartedBetween(at('2026-10-05T23:00:00'), at('2026-10-06T04:20:00'))).toBe(MATIN)
  })

  it('aucun début de fenêtre dans l’intervalle → null', () => {
    expect(nightlyWindowStartedBetween(at('2026-10-06T06:00:00'), at('2026-10-06T22:54:59'))).toBeNull()
  })
})
