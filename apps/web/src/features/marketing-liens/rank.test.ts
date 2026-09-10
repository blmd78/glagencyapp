import { describe, expect, it } from 'vitest'
import { aBouge, groupBySource, valeur } from './rank'
import type { MktLinkRow } from '@/lib/types/marketing'

const link = (o: Partial<MktLinkRow> & { id: string }): MktLinkRow => ({
  name: o.id, type: 'twitter', url: '', creatorId: null, creator: null, staff: [], active: true,
  clicks: 0, conversions: 0, revenueEur: 0, ltv: null, taux: null, ...o,
})

describe('groupBySource', () => {
  it('classe les liens d une source par le critère choisi', () => {
    const links = [
      link({ id: 'a', conversions: 2, revenueEur: 500 }),
      link({ id: 'b', conversions: 9, revenueEur: 10 }),
    ]
    expect(groupBySource(links, 'subs')[0].links.map((l) => l.id)).toEqual(['b', 'a'])
    expect(groupBySource(links, 'revenus')[0].links.map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('trie les SOURCES par leur propre score', () => {
    const links = [
      link({ id: 'tw', type: 'twitter', conversions: 5 }),
      link({ id: 'ig', type: 'instagram', conversions: 50 }),
    ]
    expect(groupBySource(links, 'subs').map((g) => g.type)).toEqual(['instagram', 'twitter'])
  })

  it('recalcule le taux de la source Σconv/Σclics, jamais la moyenne des taux', () => {
    // 1/1 = 100 % et 1/99 ≈ 1 % : la moyenne des taux dirait ~50 %, la vérité est 2 %.
    const g = groupBySource(
      [
        link({ id: 'a', clicks: 1, conversions: 1, taux: 100 }),
        link({ id: 'b', clicks: 99, conversions: 1, taux: 1 }),
      ],
      'subs',
    )[0]
    expect(g.taux).toBe(2)
  })

  it('calcule la LTV du canal sur les SOMMES, pas la moyenne des LTV des liens', () => {
    // 100 €/1 abonné et 10 €/9 abonnés : la moyenne des LTV dirait 50,6 €, la vérité est 11 €.
    const g = groupBySource(
      [
        link({ id: 'a', clicks: 5, conversions: 1, revenueEur: 100 }),
        link({ id: 'b', clicks: 5, conversions: 9, revenueEur: 10 }),
      ],
      'subs',
    )[0]
    expect(g.ltv).toBe(11)
  })

  it('rend une LTV null (pas 0) pour un canal sans abonné', () => {
    expect(groupBySource([link({ id: 'a', clicks: 8 })], 'subs')[0].ltv).toBeNull()
  })

  it('ne rend que les sources dont un lien a bougé', () => {
    const links = [
      link({ id: 'tw', type: 'twitter', clicks: 3 }),
      link({ id: 'ig', type: 'instagram' }), // muet : sa source ne doit pas apparaître
    ]
    expect(groupBySource(links, 'subs').map((g) => g.type)).toEqual(['twitter'])
  })

  it('met de côté les liens muets sans les perdre', () => {
    const g = groupBySource(
      [
        link({ id: 'vivant', clicks: 10, conversions: 2 }),
        link({ id: 'muet1' }),
        link({ id: 'muet2' }),
      ],
      'subs',
    )[0]
    expect(g.links.map((l) => l.id)).toEqual(['vivant'])
    expect(g.dormants.map((l) => l.id)).toEqual(['muet1', 'muet2'])
  })

  it('range un lien sans score sur ce critère en fin de liste, sans le perdre', () => {
    const g = groupBySource(
      [
        // Revenu attribué à retardement : zéro clic, donc aucun taux — mais bien actif.
        link({ id: 'sans', revenueEur: 40, taux: null }),
        link({ id: 'avec', clicks: 10, conversions: 1, taux: 10 }),
      ],
      'taux',
    )[0]
    expect(g.links.map((l) => l.id)).toEqual(['avec', 'sans'])
    expect(g.links).toHaveLength(2)
  })

  it('expose le meilleur score de la source, référence des barres', () => {
    const g = groupBySource(
      [link({ id: 'a', conversions: 3 }), link({ id: 'b', conversions: 12 })],
      'subs',
    )[0]
    expect(g.best).toBe(12)
  })

  it('rend un taux null (pas 0) pour une source sans le moindre clic', () => {
    // Le lien a un revenu (donc il compte) mais aucun clic : le taux n'existe pas.
    expect(groupBySource([link({ id: 'a', revenueEur: 12 })], 'subs')[0].taux).toBeNull()
  })
})

describe('valeur', () => {
  it('lit le champ du critère', () => {
    const l = link({ id: 'a', conversions: 4, revenueEur: 9, taux: 12 })
    expect(valeur(l, 'subs')).toBe(4)
    expect(valeur(l, 'revenus')).toBe(9)
    expect(valeur(l, 'taux')).toBe(12)
  })
})

describe('aBouge', () => {
  it('compte un clic, un abonné ou un euro comme une activité', () => {
    expect(aBouge(link({ id: 'a', clicks: 1 }))).toBe(true)
    expect(aBouge(link({ id: 'b', conversions: 1 }))).toBe(true)
    expect(aBouge(link({ id: 'c', revenueEur: 0.5 }))).toBe(true)
  })

  it('ne compte pas un lien resté à zéro partout', () => {
    expect(aBouge(link({ id: 'd' }))).toBe(false)
  })
})
