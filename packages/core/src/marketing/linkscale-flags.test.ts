import { describe, it, expect } from 'vitest'
import { addDaily, botShare, clickRate, emptyTotals, sumTotals, trafficFlags, type LsTotals } from './linkscale-flags'

const t = (over: Partial<LsTotals> = {}): LsTotals => ({ visitors: 0, bots: 0, mymClicks: null, mymVisitors: 0, ...over })

describe('addDaily / sumTotals', () => {
  it('une redirection (mymClicks null) ne compte pas dans les visiteurs des liens à boutons', () => {
    let acc = emptyTotals()
    acc = addDaily(acc, { visitors: 10, bots: 1, mymClicks: 6 })
    acc = addDaily(acc, { visitors: 5, bots: 0, mymClicks: null })
    expect(acc).toEqual({ visitors: 15, bots: 1, mymClicks: 6, mymVisitors: 10 })
  })
  it('sans aucun lien à boutons, les clics MYM restent null', () => {
    expect(sumTotals([t({ visitors: 3 }), t({ visitors: 2 })]).mymClicks).toBeNull()
    expect(sumTotals([t({ mymClicks: 2, mymVisitors: 4 }), t()])).toEqual(t({ mymClicks: 2, mymVisitors: 4 }))
  })
})

describe('clickRate / botShare', () => {
  it('le taux se calcule sur les visiteurs des liens à boutons, et peut dépasser 1', () => {
    expect(clickRate(t({ visitors: 100, mymClicks: 30, mymVisitors: 20 }))).toBe(1.5)
    expect(clickRate(t({ visitors: 100 }))).toBeNull()
  })
  it('part de bots sur le total des visites', () => {
    expect(botShare(t({ visitors: 30, bots: 10 }))).toBe(0.25)
    expect(botShare(t())).toBeNull()
  })
})

describe('trafficFlags', () => {
  it('éteint : 0 visiteur alors que la période précédente en avait au moins 10', () => {
    expect(trafficFlags(t(), t({ visitors: 12 }), null)).toEqual(['eteint'])
    expect(trafficFlags(t(), t({ visitors: 5 }), null)).toEqual([])
  })
  it('chute : moins de la moitié, avec au moins 30 visiteurs avant', () => {
    expect(trafficFlags(t({ visitors: 10 }), t({ visitors: 40 }), null)).toEqual(['chute'])
    expect(trafficFlags(t({ visitors: 25 }), t({ visitors: 40 }), null)).toEqual([])
    expect(trafficFlags(t({ visitors: 5 }), t({ visitors: 20 }), null)).toEqual([])
  })
  it('sans période précédente, aucun signal de chute', () => {
    expect(trafficFlags(t({ visitors: 50 }), t(), null)).toEqual([])
  })
  it('clic faible : taux sous la moitié de la référence, avec assez de visiteurs à boutons', () => {
    const cur = t({ visitors: 50, mymVisitors: 50, mymClicks: 10 })
    expect(trafficFlags(cur, t({ visitors: 50 }), 1)).toEqual(['clic-faible'])
    expect(trafficFlags(t({ visitors: 50, mymVisitors: 20, mymClicks: 1 }), t({ visitors: 50 }), 1)).toEqual([])
    expect(trafficFlags(cur, t({ visitors: 50 }), null)).toEqual([])
  })
  it('un taux au-dessus de 1 n’est jamais « faible » face à une référence normale', () => {
    expect(trafficFlags(t({ visitors: 40, mymVisitors: 40, mymClicks: 60 }), t({ visitors: 40 }), 1.2)).toEqual([])
  })
  it('bots : plus de 20 % sur au moins 30 visites', () => {
    expect(trafficFlags(t({ visitors: 40, bots: 15 }), t({ visitors: 40 }), null)).toEqual(['bots'])
    expect(trafficFlags(t({ visitors: 10, bots: 5 }), t({ visitors: 10 }), null)).toEqual([])
  })
})
