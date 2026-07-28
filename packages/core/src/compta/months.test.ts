import { describe, expect, it } from 'vitest'
import { monthOf, monthOfPeriod, mondaysOfMonth, periodsOfMonth } from './months'
import { periodOf, PERIOD_ANCHOR } from './periods'
import { addDays, mondayOf } from '../domain/dates'

describe('monthOf', () => {
  it('borne le mois civil et le nomme', () => {
    expect(monthOf('2026-07-27')).toEqual({
      key: '2026-07', start: '2026-07-01', end: '2026-07-31', label: 'juillet 2026',
    })
  })

  it('gere fevrier et les annees bissextiles', () => {
    expect(monthOf('2026-02-10').end).toBe('2026-02-28')
    expect(monthOf('2028-02-10').end).toBe('2028-02-29')
  })

  it('gere decembre — le mois suivant change d annee', () => {
    expect(monthOf('2026-12-31')).toEqual({
      key: '2026-12', start: '2026-12-01', end: '2026-12-31', label: 'décembre 2026',
    })
  })
})

describe('monthOfPeriod — rattachement par le LUNDI DE DEPART', () => {
  it('rattache une periode A CHEVAL au mois de son lundi de depart, jamais aux deux', () => {
    // 20/07 → 02/08 : 12 jours en juillet, 2 en aout. Elle appartient a JUILLET.
    expect(monthOfPeriod(periodOf('2026-07-20')).key).toBe('2026-07')
    // 31/08 → 13/09 : 1 jour en aout, 13 en septembre. Elle appartient quand meme a AOUT —
    // la majorite des jours n'est PAS le critere, sinon le rattachement ne serait plus une
    // partition et deux mois pourraient reclamer la meme prime.
    expect(monthOfPeriod(periodOf('2026-08-31')).key).toBe('2026-08')
  })

  it('rattache une periode a cheval sur deux ANNEES au mois de son lundi', () => {
    // 21/12/2026 → 03/01/2027.
    expect(monthOfPeriod(periodOf('2027-01-01'))).toEqual({
      key: '2026-12', start: '2026-12-01', end: '2026-12-31', label: 'décembre 2026',
    })
  })
})

describe('periodsOfMonth', () => {
  it('rend 2 periodes pour juillet 2026 — celle qui contient le 1er a demarre en JUIN', () => {
    // Le 01/07 tombe dans la periode du 22/06 : elle appartient a juin, pas a juillet.
    expect(periodsOfMonth(monthOf('2026-07-15')).map((p) => p.start)).toEqual([
      '2026-07-06', '2026-07-20',
    ])
  })

  it('rend 3 periodes pour aout 2026 — un mois civil en contient 2 OU 3', () => {
    expect(periodsOfMonth(monthOf('2026-08-15')).map((p) => p.start)).toEqual([
      '2026-08-03', '2026-08-17', '2026-08-31',
    ])
  })

  it('est une PARTITION : sur deux ans, chaque periode appartient a un mois et un seul', () => {
    // C'EST LE TEST QUI GARDE L'ARGENT. La prime du mois est saisie sur UNE periode et bornee a
    // une par (chatteur, mois) : si une periode appartenait a deux mois, elle serait payable deux
    // fois ; si elle n'appartenait a aucun, sa prime serait invisible et jamais versee.
    const seen = new Map<string, string[]>()
    for (let i = 0; i < 24; i++) {
      const month = monthOf(`${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`)
      const list = periodsOfMonth(month)
      expect(list.length).toBeGreaterThanOrEqual(2)
      expect(list.length).toBeLessThanOrEqual(3)
      for (const p of list) {
        seen.set(p.start, [...(seen.get(p.start) ?? []), month.key])
        // Le mois d'appartenance est bien celui que `monthOfPeriod` annonce.
        expect(monthOfPeriod(p).key).toBe(month.key)
      }
    }
    // Aucune periode revendiquee par deux mois.
    for (const [start, months] of seen) expect([start, months]).toEqual([start, [months[0]]])
    // Aucun trou : les debuts collectes se suivent de 14 en 14 jours.
    const starts = [...seen.keys()].sort()
    for (let i = 1; i < starts.length; i++) expect(starts[i]).toBe(addDays(starts[i - 1], 14))
  })

  it('contient toujours la periode dont on est parti', () => {
    for (let i = -400; i <= 400; i += 13) {
      const p = periodOf(addDays(PERIOD_ANCHOR, i))
      expect(periodsOfMonth(monthOfPeriod(p)).map((x) => x.start)).toContain(p.start)
    }
  })
})

describe('mondaysOfMonth', () => {
  it('rend les lundis DU MOIS, et aucun d un autre mois', () => {
    expect(mondaysOfMonth(monthOf('2026-07-15'))).toEqual([
      '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
    ])
    // Aout 2026 en compte cinq — 4 ou 5 selon le mois.
    expect(mondaysOfMonth(monthOf('2026-08-15'))).toEqual([
      '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
    ])
  })

  it('n est PAS l union des lundis des periodes du mois — les deux grains different', () => {
    // Septembre 2026 : le lundi 07/09 est un lundi de SEPTEMBRE (ses handoffs comptent pour
    // septembre) alors qu'il appartient a la periode du 31/08, donc au mois d'AOUT pour la prime
    // setter. Les deux agregats repondent a deux questions differentes.
    const sept = monthOf('2026-09-15')
    expect(mondaysOfMonth(sept)).toContain('2026-09-07')
    expect(periodsOfMonth(sept).map((p) => p.start)).toEqual(['2026-09-14', '2026-09-28'])
    expect(monthOfPeriod(periodOf('2026-09-07')).key).toBe('2026-08')
  })

  it('ne rend que des lundis, sur un large balayage', () => {
    for (let i = -400; i <= 400; i += 17) {
      const m = monthOf(addDays(PERIOD_ANCHOR, i))
      const list = mondaysOfMonth(m)
      expect(list.length).toBeGreaterThanOrEqual(4)
      expect(list.length).toBeLessThanOrEqual(5)
      for (const d of list) {
        expect(mondayOf(d)).toBe(d)
        expect(d >= m.start && d <= m.end).toBe(true)
      }
    }
  })
})
