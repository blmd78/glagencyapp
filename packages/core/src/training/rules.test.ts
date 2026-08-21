import { describe, expect, it } from 'vitest'
import { bossUnlocked, computeTrophies, effectiveStreak, medalFor, moduleProgress, TROPHIES } from './rules'

describe('medalFor (GLA medalFor : Or ≥ 85, Argent ≥ 75, Bronze ≥ 60)', () => {
  it('seuils inclus', () => {
    expect(medalFor(100)).toBe('or'); expect(medalFor(85)).toBe('or'); expect(medalFor(84)).toBe('argent')
    expect(medalFor(75)).toBe('argent'); expect(medalFor(74)).toBe('bronze'); expect(medalFor(60)).toBe('bronze')
    expect(medalFor(59)).toBeNull(); expect(medalFor(null)).toBeNull()
  })
})

describe('bossUnlocked (moyenne ≥ 60)', () => {
  it('60 débloque, 59.9 non, null non', () => {
    expect(bossUnlocked(60)).toBe(true); expect(bossUnlocked(59.9)).toBe(false); expect(bossUnlocked(null)).toBe(false)
  })
})

describe('moduleProgress', () => {
  const cases = [{ id: 'a', kind: 'solo' }, { id: 'b', kind: 'solo' }, { id: 'c', kind: 'arena' }]
  it('compte les cas faits, % , moyenne et points depuis les meilleurs', () => {
    const bests = new Map([['a', { bestTotal: 80 }], ['c', { bestTotal: 60 }]])
    expect(moduleProgress(cases, bests)).toEqual({ total: 3, done: 2, pct: 67, avg: 70, points: 140 })
  })
  it('module vide / rien de fait', () => {
    expect(moduleProgress([], new Map())).toEqual({ total: 0, done: 0, pct: 0, avg: null, points: 0 })
    expect(moduleProgress(cases, new Map())).toEqual({ total: 3, done: 0, pct: 0, avg: null, points: 0 })
  })
})

describe('computeTrophies (jalons GLA)', () => {
  it('8 trophées, gagnés selon les seuils', () => {
    expect(TROPHIES).toHaveLength(8)
    const none = computeTrophies({ casesDone: 0, streakDays: 0, goldCount: 0, modulesComplete: 0, allDone: false, bossDone: false })
    expect(none.every((t) => !t.earned)).toBe(true)
    const some = computeTrophies({ casesDone: 3, streakDays: 3, goldCount: 5, modulesComplete: 1, allDone: false, bossDone: false })
    expect(some.filter((t) => t.earned).map((t) => t.key)).toEqual(['first_case', 'streak_3', 'gold_5', 'module_complete'])
    const all = computeTrophies({ casesDone: 85, streakDays: 7, goldCount: 15, modulesComplete: 6, allDone: true, bossDone: true })
    expect(all.every((t) => t.earned)).toBe(true)
  })
})

describe('effectiveStreak (streak_days ne se périme pas seul en base — même règle que les RPC SQL 0119)', () => {
  it('dernier jour actif = aujourd’hui → streak conservé', () => {
    expect(effectiveStreak(4, '2026-08-18', '2026-08-18')).toBe(4)
  })
  it('dernier jour actif = hier → streak conservé', () => {
    expect(effectiveStreak(4, '2026-08-17', '2026-08-18')).toBe(4)
  })
  it('dernier jour actif = avant-hier → streak périmé (0)', () => {
    expect(effectiveStreak(4, '2026-08-16', '2026-08-18')).toBe(0)
  })
  it('pas de jour actif → 0', () => {
    expect(effectiveStreak(4, null, '2026-08-18')).toBe(0)
  })
  it('streak déjà à 0 → 0', () => {
    expect(effectiveStreak(0, '2026-08-18', '2026-08-18')).toBe(0)
  })
})
