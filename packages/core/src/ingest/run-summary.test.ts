import { describe, it, expect } from 'vitest'
import { summarizeRun, type IngestDayResult } from './run-summary'

const day = (over: Partial<IngestDayResult> = {}): IngestDayResult => ({
  date: '2026-07-02',
  creatorRows: 8,
  chatterRows: 5,
  pairRows: 12,
  source: 'dashboard',
  ...over,
})

const base = {
  loginOk: true,
  dashboardOk: true,
  catchup: true,
  warnings: [] as string[],
  durationMs: 1200,
}

describe('summarizeRun', () => {
  it('run nominal → ok', () => {
    const s = summarizeRun({ ...base, days: [day()] })
    expect(s.status).toBe('ok')
    expect(s.warnings).toEqual([])
  })

  it('login money-team KO → degraded (chatteurs non ingérés)', () => {
    const s = summarizeRun({
      ...base,
      loginOk: false,
      warnings: ['login money-team échoué'],
      days: [day({ chatterRows: 0, pairRows: 0 })],
    })
    expect(s.status).toBe('degraded')
  })

  it('un jour en échec → degraded, les autres jours restent comptés', () => {
    const s = summarizeRun({
      ...base,
      days: [day(), day({ date: '2026-07-03', creatorRows: 0, error: 'HTTP 429' })],
    })
    expect(s.status).toBe('degraded')
    expect(s.days).toHaveLength(2)
  })

  it('0 ligne creator_daily sur tout le run → degraded avec warning explicite', () => {
    const s = summarizeRun({ ...base, days: [day({ creatorRows: 0, chatterRows: 0, pairRows: 0 })] })
    expect(s.status).toBe('degraded')
    expect(s.warnings.some((w) => w.includes('creator_daily'))).toBe(true)
  })

  it('login OK mais 0 chatteur sur toute la fenêtre → degraded (markup money-team cassé)', () => {
    const s = summarizeRun({
      ...base,
      days: [day({ chatterRows: 0, pairRows: 0 }), day({ date: '2026-07-03', chatterRows: 0, pairRows: 0 })],
    })
    expect(s.status).toBe('degraded')
    expect(s.warnings.some((w) => w.includes('chatter_daily'))).toBe(true)
  })

  it('aucun jour traité → degraded', () => {
    expect(summarizeRun({ ...base, days: [] }).status).toBe('degraded')
  })

  it('rejeu explicite (catchup: false) d’un jour vide → ok, pas de faux positif', () => {
    const s = summarizeRun({
      ...base,
      catchup: false,
      days: [day({ creatorRows: 0, chatterRows: 0, pairRows: 0 })],
    })
    expect(s.status).toBe('ok')
    expect(s.warnings).toEqual([])
  })

  it('rejeu explicite avec login KO → degraded quand même (problème infra)', () => {
    const s = summarizeRun({
      ...base,
      catchup: false,
      loginOk: false,
      days: [day({ chatterRows: 0, pairRows: 0 })],
    })
    expect(s.status).toBe('degraded')
  })

  // Décision revue le 2026-07-03 : dashboard KO ⇒ DEGRADED. Le fallback /team/money
  // écrit des creator_daily PARTIELS (messagerie seule, subs à 0) qui peuvent écraser
  // un jour déjà complet de la fenêtre, et le run suivant sort ce jour de la fenêtre
  // (régression permanente). Sans degraded, aucune alerte Sentry → invisible.
  it('dashboard KO (fallback API) → degraded : le fallback partiel peut écraser un jour complet', () => {
    const s = summarizeRun({
      ...base,
      dashboardOk: false,
      warnings: ['dashboard indisponible → fallback /team/money'],
      days: [day({ source: 'api' })],
    })
    expect(s.status).toBe('degraded')
    expect(s.warnings).toContain('dashboard indisponible → fallback /team/money')
  })

  it('préserve les warnings du pipeline sans les dupliquer', () => {
    const s = summarizeRun({
      ...base,
      loginOk: false,
      warnings: ['login money-team échoué'],
      days: [day()],
    })
    expect(s.warnings.filter((w) => w === 'login money-team échoué')).toHaveLength(1)
  })
})
