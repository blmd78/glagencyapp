import { describe, expect, it } from 'vitest'
import { buildDailyShare, buildModeles } from './aggregate'
import type { CreatorRevenue } from './types'
import type { MktLinkRow } from '@/lib/types/marketing'
import type { MktLinkDailyRow } from '@/lib/services/get-mkt-links'

const rev = (o: Partial<CreatorRevenue> & { creator_id: string }): CreatorRevenue => ({
  name: 'X', ca: 0, new_subs: 0, subs_active: 0, ...o,
})

const link = (o: Partial<MktLinkRow> & { id: string }): MktLinkRow => ({
  name: 'l', type: 'twitter', url: '', creatorId: null, creator: null, staff: [], active: true,
  clicks: 0, conversions: 0, revenueEur: 0, ltv: null, taux: null, ...o,
})

const daily = (o: Partial<MktLinkDailyRow> & { date: string }): MktLinkDailyRow => ({
  link_id: 'a', clicks: 0, conversions: 0, revenue_eur: 0, ...o,
})

describe('buildModeles', () => {
  it('rattache un lien à sa modèle par ID, pas par nom', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 1000, new_subs: 100 })],
      // `creator` (le nom) est null : c'est ce que voit un non-admin sous RLS.
      [link({ id: 'l1', creatorId: 'c1', creator: null, conversions: 10, revenueEur: 50 })],
      [],
      'Juin',
    )
    expect(d.modeles[0].links).toHaveLength(1)
    expect(d.modeles[0].caLiens).toBe(50)
    expect(d.modeles[0].subsLiens).toBe(10)
  })

  it('calcule les parts en % et arrondit à une décimale', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 1000, new_subs: 100 })],
      [link({ id: 'l1', creatorId: 'c1', conversions: 5, revenueEur: 30 })],
      [],
      'Juin',
    )
    expect(d.modeles[0].partCa).toBe(3)
    expect(d.modeles[0].partSubs).toBe(5)
  })

  it('rend null (jamais 0) quand le dénominateur est nul', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 0, new_subs: 0 })],
      [link({ id: 'l1', creatorId: 'c1', conversions: 3, revenueEur: 10 })],
      [],
      'Juin',
    )
    expect(d.modeles[0].partCa).toBeNull()
    expect(d.modeles[0].partSubs).toBeNull()
  })

  it('calcule le € par abonné de la modèle, null sans abonné', () => {
    const d = buildModeles(
      [
        rev({ creator_id: 'c1', name: 'Carla', ca: 1000, new_subs: 40 }),
        rev({ creator_id: 'c2', name: 'Elsa', ca: 0, new_subs: 0 }),
      ],
      [],
      [],
      'Juin',
    )
    expect(d.modeles.find((m) => m.name === 'Carla')!.ltv).toBe(25)
    expect(d.modeles.find((m) => m.name === 'Elsa')!.ltv).toBeNull()
  })

  it('garde une modèle sans aucun lien, à zéro et sans part', () => {
    const d = buildModeles([rev({ creator_id: 'c1', name: 'Claire', ca: 500, new_subs: 30 })], [], [], 'Juin')
    expect(d.modeles[0].links).toHaveLength(0)
    expect(d.modeles[0].caLiens).toBe(0)
    expect(d.modeles[0].partSubs).toBe(0)
  })

  it('ignore un lien sans modèle rattachée, mais le compte dans les totaux', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', name: 'Carla', ca: 100, new_subs: 10 })],
      [link({ id: 'l1', creatorId: null, conversions: 5, revenueEur: 20 })],
      [],
      'Juin',
    )
    expect(d.modeles).toHaveLength(1)
    expect(d.modeles[0].caLiens).toBe(0)
    // Son revenu est réel : il ne s'accroche à aucune bande mais pèse dans l'agence.
    expect(d.totals.caLiens).toBe(20)
  })

  it('trie les modèles par CA total décroissant et leurs liens par abonnés', () => {
    const d = buildModeles(
      [
        rev({ creator_id: 'c1', name: 'Petite', ca: 100, new_subs: 10 }),
        rev({ creator_id: 'c2', name: 'Grosse', ca: 900, new_subs: 90 }),
      ],
      [
        link({ id: 'a', creatorId: 'c2', conversions: 2, revenueEur: 99 }),
        link({ id: 'b', creatorId: 'c2', conversions: 8, revenueEur: 1 }),
      ],
      [],
      'Juin',
    )
    expect(d.modeles.map((m) => m.name)).toEqual(['Grosse', 'Petite'])
    expect(d.modeles[0].links.map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('dit hasLinkData=false quand AUCUN lien n a de relevé sur la période', () => {
    const d = buildModeles([rev({ creator_id: 'c1', ca: 100, new_subs: 10 })], [], [], 'Septembre')
    expect(d.hasLinkData).toBe(false)
  })

  it('dit hasLinkData=true dès qu un lien a un clic, même sans revenu', () => {
    const d = buildModeles(
      [rev({ creator_id: 'c1', ca: 100, new_subs: 10 })],
      [link({ id: 'l1', creatorId: 'c1', clicks: 4 })],
      [],
      'Juin',
    )
    expect(d.hasLinkData).toBe(true)
  })
})

describe('buildDailyShare', () => {
  it('calcule la part de chaque jour et ordonne par date', () => {
    const r = buildDailyShare(
      [
        { date: '2026-06-02', new_subs: 200 },
        { date: '2026-06-01', new_subs: 100 },
      ],
      [
        daily({ date: '2026-06-01', conversions: 10 }),
        daily({ date: '2026-06-01', conversions: 5, link_id: 'b' }),
        daily({ date: '2026-06-02', conversions: 40 }),
      ],
    )
    expect(r.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02'])
    expect(r[0].subsLiens).toBe(15)
    expect(r[0].part).toBe(15)
    expect(r[1].part).toBe(20)
  })

  it('rend part=null (un trou, pas un zéro) un jour sans nouvel abonné', () => {
    const r = buildDailyShare([{ date: '2026-06-01', new_subs: 0 }], [])
    expect(r[0].part).toBeNull()
  })

  it('garde un jour sans relevé de lien à 0 %, ce qui est vrai', () => {
    const r = buildDailyShare([{ date: '2026-06-01', new_subs: 50 }], [])
    expect(r[0].part).toBe(0)
  })
})
