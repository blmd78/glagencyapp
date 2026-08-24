import { describe, expect, it } from 'vitest'
import { streakFromDays } from './streak'

/**
 * `streakFromDays` est la PARADE de §3.7 : sans elle, `training_refresh_stats` rejoué par un import
 * rend une valeur arbitraire (calcul incrémental, dépendant de l'ordre, et `last_active_day` qui ne
 * recule jamais). Les cas ci-dessous sont exactement ceux qu'un import produit — jours dans le
 * désordre, doublons (plusieurs sessions le même jour), et une vieille série plus longue que la
 * série courante.
 */
describe('streakFromDays', () => {
  it('rend 0 et null sur une liste vide', () => {
    expect(streakFromDays([])).toEqual({ streakDays: 0, lastActiveDay: null })
  })

  it('compte la série qui se termine au DERNIER jour, pas la plus longue du corpus', () => {
    // Série de 5 en juillet, puis un trou, puis 2 jours en août : la réponse est 2.
    const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-08-10', '2026-08-11']
    expect(streakFromDays(days)).toEqual({ streakDays: 2, lastActiveDay: '2026-08-11' })
  })

  it('ignore l’ordre d’arrivée et les doublons — un import n’est jamais trié', () => {
    const days = ['2026-08-11', '2026-08-09', '2026-08-11', '2026-08-10', '2026-08-09']
    expect(streakFromDays(days)).toEqual({ streakDays: 3, lastActiveDay: '2026-08-11' })
  })

  it('traverse un changement de mois et une année bissextile', () => {
    expect(streakFromDays(['2026-01-30', '2026-01-31', '2026-02-01'])).toEqual({
      streakDays: 3,
      lastActiveDay: '2026-02-01',
    })
    expect(streakFromDays(['2024-02-28', '2024-02-29', '2024-03-01'])).toEqual({
      streakDays: 3,
      lastActiveDay: '2024-03-01',
    })
  })

  it('rend 1 quand le dernier jour est isolé', () => {
    expect(streakFromDays(['2026-08-01', '2026-08-02', '2026-08-20'])).toEqual({
      streakDays: 1,
      lastActiveDay: '2026-08-20',
    })
  })

  it('ne compte pas deux jours séparés par un seul jour vide', () => {
    expect(streakFromDays(['2026-08-10', '2026-08-12'])).toEqual({ streakDays: 1, lastActiveDay: '2026-08-12' })
  })
})
