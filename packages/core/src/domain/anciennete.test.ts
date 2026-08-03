import { describe, expect, it } from 'vitest'
import { daysSinceArrival, isStaleNew, NEW_THRESHOLD_DAYS } from './anciennete'

const TODAY = '2026-07-30'

describe('daysSinceArrival', () => {
  it('rend null sans date d’arrivée', () => {
    expect(daysSinceArrival(null, TODAY)).toBeNull()
  })

  it('compte les jours écoulés', () => {
    expect(daysSinceArrival('2026-07-30', TODAY)).toBe(0)
    expect(daysSinceArrival('2026-07-01', TODAY)).toBe(29)
    expect(daysSinceArrival('2026-06-30', TODAY)).toBe(30)
  })

  it('traverse un changement d’heure sans dériver', () => {
    // 29/03/2026 = passage à l'heure d'été (UTC+1 → UTC+2). Un calcul en heures locales rendrait
    // 30,96 jours et arrondirait à 31 — le badge basculerait en warning un jour trop tôt.
    expect(daysSinceArrival('2026-03-01', '2026-03-31')).toBe(30)
  })

  it('ne compte jamais négatif sur une date future', () => {
    expect(daysSinceArrival('2026-08-15', TODAY)).toBe(0)
  })

  it('rend null sur une date illisible', () => {
    expect(daysSinceArrival('pas-une-date', TODAY)).toBeNull()
  })
})

describe('isStaleNew', () => {
  it('ne signale rien si le membre n’est pas marqué nouveau', () => {
    expect(isStaleNew(false, '2020-01-01', TODAY)).toBe(false)
  })

  it('ne signale rien sans date d’arrivée', () => {
    expect(isStaleNew(true, null, TODAY)).toBe(false)
  })

  it('laisse passer le seuil exact, signale au-delà', () => {
    expect(isStaleNew(true, '2026-07-01', TODAY)).toBe(false) // 29 j
    expect(isStaleNew(true, '2026-06-30', TODAY)).toBe(false) // 30 j = le seuil
    expect(isStaleNew(true, '2026-06-29', TODAY)).toBe(true) // 31 j
  })

  it('expose le seuil pour que personne ne le code en dur', () => {
    expect(NEW_THRESHOLD_DAYS).toBe(30)
  })
})
