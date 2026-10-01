import { describe, it, expect } from 'vitest'
import { buildTrafic, type TraficDailyInput, type TraficLinkInput } from './aggregate'

const period = { from: '2026-09-15', to: '2026-09-28', label: '15 sept. – 28 sept. 2026' }
const link = (over: Partial<TraficLinkInput>): TraficLinkInput => ({
  id: 'l',
  url: 'heyliiink.com/x',
  note: '',
  creator_id: null,
  platform: 'autre',
  social_account_id: null,
  operator: null,
  manual: false,
  ...over,
})
const day = (link_id: string, date: string, visitors: number, mym_clicks: number | null, bots = 0): TraficDailyInput => ({
  link_id,
  date,
  visitors,
  bots,
  mym_clicks,
})

const creators = [
  { id: 'c-carla', name: 'Carla' },
  { id: 'c-julie', name: 'Julie' },
]
const accounts = [{ id: 'a-tardif', handle: 'Julietardifff' }]

describe('buildTrafic', () => {
  const data = buildTrafic({
    period,
    dataTo: '2026-09-28',
    creators,
    accounts,
    links: [
      link({ id: 'ara', url: 'carlaprof.live/carla', note: 'TW ARA CARLA', creator_id: 'c-carla', platform: 'x', operator: 'ARA' }),
      link({ id: 'ig', url: 'heyliiink.com/jt', note: 'IN JULIETARDIFF', creator_id: 'c-julie', platform: 'instagram', social_account_id: 'a-tardif' }),
      link({ id: 'snap', url: 'heyliiink.com/snp', note: 'Carla', creator_id: 'c-carla', platform: 'snapchat' }),
      link({ id: 'dead', url: 'heyliiink.com/old', note: 'TW OLD' }),
    ],
    daily: [
      // période précédente (1er → 14/09)
      day('ara', '2026-09-05', 80, 90),
      day('ig', '2026-09-05', 10, 5),
      // période
      day('ara', '2026-09-20', 30, 40),
      day('ig', '2026-09-20', 40, 4, 20),
      day('snap', '2026-09-21', 25, null),
    ],
  })

  it('ne garde que les liens qui ont du trafic sur l’une des deux périodes', () => {
    expect(data.links.map((r) => r.key).sort()).toEqual(['ara', 'ig', 'snap'])
  })

  it('libellé du profil : compte Instagram, sinon opérateur, sinon note', () => {
    const label = Object.fromEntries(data.links.map((r) => [r.key, r.label]))
    expect(label).toEqual({ ara: 'ARA', ig: '@Julietardifff', snap: 'Carla' })
  })

  it('totaux : les redirections ne diluent pas le taux de clic', () => {
    expect(data.totals.cur).toEqual({ visitors: 95, bots: 20, mymClicks: 44, mymVisitors: 70 })
    expect(data.totals.prev.visitors).toBe(90)
  })

  it('signale la chute, le clic faible et les bots au bon endroit', () => {
    const flags = Object.fromEntries(data.links.map((r) => [r.key, r.flags]))
    expect(flags.ara).toEqual(['chute'])
    expect(flags.ig).toEqual(['clic-faible', 'bots'])
    expect(flags.snap).toEqual([])
  })

  it('trie par visiteurs de la période, les plus fréquentées d’abord', () => {
    expect(data.links.at(-1)!.key).toBe('snap')
  })

  it('regroupe par modèle et par réseau', () => {
    const carla = data.models.find((r) => r.key === 'c-carla')!
    expect(carla.label).toBe('Carla')
    expect(carla.cur.visitors).toBe(55)
    expect(carla.sub).toBe('2 lien(s)')
    expect(data.networks.map((r) => r.label).sort()).toEqual(['Instagram', 'Snapchat', 'X'])
  })

  it('courbe : un point par jour relevé dans la période, dans l’ordre', () => {
    expect(data.daily).toEqual([
      { date: '2026-09-20', visitors: 70, mymClicks: 44 },
      { date: '2026-09-21', visitors: 25, mymClicks: 0 },
    ])
    expect(data.lastDate).toBe('2026-09-21')
  })

  it('sans période précédente : évolution « — », aucun signal de chute', () => {
    const fresh = buildTrafic({
      period,
      dataTo: '2026-09-28',
      creators,
      accounts,
      links: [link({ id: 'n', platform: 'x', operator: 'NEW' })],
      daily: [day('n', '2026-09-20', 50, 20)],
    })
    expect(fresh.links[0]!.deltaPct).toBeNull()
    expect(fresh.links[0]!.flags).toEqual([])
  })

  it('porte de quoi corriger une ligne de lien, jamais un regroupement', () => {
    expect(data.links.find((r) => r.key === 'ig')!.edit).toEqual({
      linkId: 'ig',
      creatorId: 'c-julie',
      platform: 'instagram',
      socialAccountId: 'a-tardif',
      operator: null,
      manual: false,
    })
    expect(data.models.every((r) => r.edit === null)).toBe(true)
  })
})

describe('buildTrafic — période en cours incomplète', () => {
  it('le 1er du mois, avant le relevé du jour : aucun lien, aucun faux « Éteint »', () => {
    const r = buildTrafic({
      period: { from: '2026-10-01', to: '2026-10-01', label: 'Octobre 2026' },
      dataTo: '2026-09-30',
      creators,
      accounts,
      links: [link({ id: 'a', platform: 'x', operator: 'ARA' })],
      daily: [day('a', '2026-09-30', 20, 10)],
    })
    expect(r.links).toEqual([])
    expect(r.totals.cur.visitors).toBe(0)
    expect(r.lastDate).toBeNull()
  })

  it('la période s’arrête au dernier jour relevé, et la précédente a la même durée', () => {
    const r = buildTrafic({
      period: { from: '2026-09-01', to: '2026-09-03', label: '1 sept. – 3 sept. 2026' },
      dataTo: '2026-09-02',
      creators,
      accounts,
      links: [link({ id: 'a', platform: 'x', operator: 'ARA' })],
      daily: [
        day('a', '2026-08-29', 100, 50), // hors de la fenêtre de comparaison (2 jours)
        day('a', '2026-08-30', 10, 5),
        day('a', '2026-08-31', 10, 5),
        day('a', '2026-09-01', 10, 5),
        day('a', '2026-09-02', 9, 5),
      ],
    })
    expect(r.totals.prev.visitors).toBe(20)
    expect(r.links[0]!.deltaPct).toBe(-5)
    expect(r.links[0]!.flags).toEqual([])
  })
})

describe('buildTrafic — profils', () => {
  it('regroupe les liens d’un même profil : opérateur X sur plusieurs modèles, compte Instagram', () => {
    const r = buildTrafic({
      period,
      dataTo: '2026-09-28',
      creators,
      accounts,
      links: [
        link({ id: 'a1', platform: 'x', operator: 'ARA', creator_id: 'c-carla' }),
        link({ id: 'a2', platform: 'x', operator: 'ARA', creator_id: 'c-julie' }),
        link({ id: 'i1', platform: 'instagram', social_account_id: 'a-tardif', note: 'IN JULIETARDIFF' }),
        link({ id: 's1', platform: 'snapchat', note: 'Carla' }),
      ],
      daily: [
        day('a1', '2026-09-20', 10, 5),
        day('a2', '2026-09-20', 15, 5),
        day('i1', '2026-09-20', 8, 2),
        day('s1', '2026-09-20', 4, null),
      ],
    })
    const ara = r.profiles.find((p) => p.label === 'ARA')!
    expect(ara).toMatchObject({ key: 'x:ARA', platform: 'x', sub: '2 lien(s)', edit: null })
    expect(ara.cur.visitors).toBe(25)
    expect(r.profiles.map((p) => p.label).sort()).toEqual(['@Julietardifff', 'ARA', 'Carla'])
    expect(r.links).toHaveLength(4)
  })
})

describe('buildTrafic — tri', () => {
  it('les lignes avec du trafic passent devant ; les éteintes finissent en bas, par trafic perdu', () => {
    const r = buildTrafic({
      period,
      dataTo: '2026-09-28',
      creators,
      accounts,
      links: [
        link({ id: 'off-small', platform: 'x', operator: 'OFF1' }),
        link({ id: 'off-big', platform: 'x', operator: 'OFF2' }),
        link({ id: 'live', platform: 'x', operator: 'LIVE' }),
      ],
      daily: [
        day('off-small', '2026-09-05', 15, 5), // période précédente seulement → « Éteint »
        day('off-big', '2026-09-05', 90, 40), // idem, plus gros trafic perdu
        day('live', '2026-09-05', 10, 5),
        day('live', '2026-09-20', 10, 5),
      ],
    })
    expect(r.links.map((l) => l.key)).toEqual(['live', 'off-big', 'off-small'])
    expect(r.links[1]!.flags).toEqual(['eteint'])
  })
})
