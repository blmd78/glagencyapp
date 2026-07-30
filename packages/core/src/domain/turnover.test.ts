import { describe, expect, it } from 'vitest'
import { tenureDays, turnoverRate } from './turnover'

describe('tenureDays', () => {
  it('rend null si l’arrivée est inconnue', () => {
    // LE CAS MAJORITAIRE au démarrage : les 109 chatteurs de la prod n'ont pas de date
    // d'arrivée. La moyenne d'ancienneté doit les EXCLURE, surtout pas les compter zéro —
    // ce serait un chiffre faux présenté comme une mesure.
    expect(tenureDays(null, '2026-08-15')).toBeNull()
  })

  it('rend null si le membre est encore en poste', () => {
    expect(tenureDays('2026-01-01', null)).toBeNull()
  })

  it('compte les jours entre arrivée et sortie', () => {
    expect(tenureDays('2026-01-01', '2026-01-31')).toBe(30)
    expect(tenureDays('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('traverse un changement d’heure sans dériver', () => {
    // 29/03/2026 = passage à l'heure d'été. Un calcul en heures locales rendrait 30,96 jours.
    expect(tenureDays('2026-03-01', '2026-03-31')).toBe(30)
  })

  it('rend null si la sortie précède l’arrivée (saisie incohérente)', () => {
    // Plutôt que de rendre un négatif qui polluerait silencieusement la moyenne.
    expect(tenureDays('2026-08-01', '2026-07-01')).toBeNull()
  })

  it('compte 0 pour une arrivée et une sortie le même jour', () => {
    expect(tenureDays('2026-08-01', '2026-08-01')).toBe(0)
  })
})

describe('turnoverRate', () => {
  it('rend null sur un effectif nul — jamais de division par zéro', () => {
    expect(turnoverRate(3, 0)).toBeNull()
  })

  it('rend null sur un effectif négatif (donnée aberrante)', () => {
    expect(turnoverRate(1, -5)).toBeNull()
  })

  it('rend le rapport sorties / effectif moyen', () => {
    expect(turnoverRate(5, 100)).toBeCloseTo(0.05)
    expect(turnoverRate(12, 48)).toBeCloseTo(0.25)
  })

  it('rend 0 sans aucune sortie', () => {
    expect(turnoverRate(0, 40)).toBe(0)
  })
})
