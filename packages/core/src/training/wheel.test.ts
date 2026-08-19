import { describe, expect, it } from 'vitest'
import { lastCompletedWeek, pickWeighted, weekLabel, WHEEL_DEFAULT_PRIZES, WHEEL_DEFAULT_SECTORS, WHEEL_TOP_N } from './wheel'

describe('pickWeighted', () => {
  const items = [{ label: 'a', weight: 80 }, { label: 'b', weight: 0 }, { label: 'c', weight: 20 }]
  it('choisit selon les bornes cumulées, ignore les poids nuls', () => {
    expect(pickWeighted(items, () => 0).item.label).toBe('a')
    expect(pickWeighted(items, () => 79).item.label).toBe('a')
    expect(pickWeighted(items, () => 80).item.label).toBe('c')
    expect(pickWeighted(items, () => 99).item.label).toBe('c')
    expect(pickWeighted(items, () => 80).index).toBe(2)
  })
  it('appelle rand avec la somme des poids', () => {
    let seen = -1
    pickWeighted(items, (n) => { seen = n; return 0 })
    expect(seen).toBe(100)
  })
  it('refuse une somme nulle', () => {
    expect(() => pickWeighted([{ weight: 0 }], () => 0)).toThrow()
  })
})

describe('semaines', () => {
  it('lastCompletedWeek = lundi de la semaine passée (Paris)', () => {
    expect(lastCompletedWeek('2026-08-19')).toBe('2026-08-10')   // mercredi → lundi précédent - 7
    expect(lastCompletedWeek('2026-08-17')).toBe('2026-08-10')   // lundi → semaine passée
    expect(lastCompletedWeek('2026-08-16')).toBe('2026-08-03')   // dimanche
  })
  it('weekLabel', () => { expect(weekLabel('2026-08-10')).toBe('semaine du 10/08') })
})

describe('défauts GLA (en euros)', () => {
  it('roue Cadeau 80 / Raté 20, coffre 5 lots', () => {
    expect(WHEEL_DEFAULT_SECTORS).toEqual([{ label: 'Cadeau', weight: 80, lose: false }, { label: 'Raté', weight: 20, lose: true }])
    expect(WHEEL_DEFAULT_PRIZES.map((p) => [p.label, p.weight, p.amountEur])).toEqual([
      ['5 €', 60, 5], ['10 €', 20, 10], ['Day off supplémentaire', 5, null], ['20 €', 5, 20], ['Donner 5 € à un membre de ton équipe', 10, 5],
    ])
    expect(WHEEL_TOP_N).toBe(3)
  })
})
