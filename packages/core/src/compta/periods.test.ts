import { describe, expect, it } from 'vitest'
import { daysIn, mondaysIn, PERIOD_ANCHOR, periodOf, recentPeriods } from './periods'
import { addDays, mondayOf } from '../domain/dates'

describe('periodOf — 14 jours calés sur les lundis', () => {
  it('l ancre 2026-07-06 DEMARRE une periode (bloc S1 de la feuille de juillet)', () => {
    expect(periodOf('2026-07-06')).toEqual({
      start: '2026-07-06', end: '2026-07-19', label: 'du 6 au 19 juillet 2026',
    })
  })

  it('range chaque jour du bloc dans la MEME periode, du lundi au dimanche 13 jours plus tard', () => {
    for (const d of ['2026-07-06', '2026-07-12', '2026-07-13', '2026-07-19']) {
      expect(periodOf(d).start).toBe('2026-07-06')
    }
    // Le jour SUIVANT bascule : la periode ne deborde pas de ses 14 jours.
    expect(periodOf('2026-07-20').start).toBe('2026-07-20')
    expect(periodOf('2026-07-05').start).toBe('2026-06-22')
  })

  it('confirme les deux blocs voisins releves dans la feuille, a 14 jours d intervalle', () => {
    // 2026-07-20 et 2026-06-22 sont des DEBUTS de bloc — c'est ce qui a valide l'ancre.
    expect(periodOf('2026-07-20').start).toBe('2026-07-20')
    expect(periodOf('2026-06-22').start).toBe('2026-06-22')
  })

  it('fonctionne AVANT l ancre — l ecart negatif ne doit pas decaler d une periode', () => {
    // `Math.trunc` au lieu de `Math.floor` rangerait 2026-07-05 (ecart −1 jour) dans la
    // periode de l'ancre elle-meme.
    expect(periodOf('2026-07-05').start).toBe('2026-06-22')
    expect(periodOf('2026-06-21').start).toBe('2026-06-08')
    expect(periodOf('1988-03-07').start).toBe('1988-03-07')
  })

  it('demarre TOUJOURS un lundi, sur un large balayage', () => {
    for (let i = -400; i <= 400; i += 7) {
      const p = periodOf(addDays(PERIOD_ANCHOR, i))
      expect(mondayOf(p.start)).toBe(p.start)
    }
  })

  it('ne suit PAS le mois : une periode chevauche deux mois, voire deux annees', () => {
    expect(periodOf('2026-07-01')).toEqual({
      start: '2026-06-22', end: '2026-07-05', label: 'du 22 juin au 5 juillet 2026',
    })
    expect(periodOf('2027-01-01')).toEqual({
      start: '2026-12-21', end: '2027-01-03', label: 'du 21 décembre 2026 au 3 janvier 2027',
    })
  })
})

describe('mondaysIn', () => {
  it('rend EXACTEMENT deux lundis — le debut et le suivant', () => {
    expect(mondaysIn(periodOf('2026-07-10'))).toEqual(['2026-07-06', '2026-07-13'])
    expect(mondaysIn(periodOf('2026-12-25'))).toEqual(['2026-12-21', '2026-12-28'])
  })

  it('en rend deux QUEL QUE SOIT le jour consulte — la variabilite 2/3 a disparu', () => {
    // L'ancien decoupage calendaire en rendait 3 sur les mois dont le 1er tombait un lundi
    // (juin 2026 : lundis 01, 08, 15 en P1). Ce cas n'existe plus.
    for (let i = -400; i <= 400; i += 3) {
      expect(mondaysIn(periodOf(addDays(PERIOD_ANCHOR, i)))).toHaveLength(2)
    }
  })

  it('une semaine n est jamais decoupee : ses 7 jours tombent dans la meme periode', () => {
    const monday = '2026-07-13'
    const starts = new Set(
      Array.from({ length: 7 }, (_, i) => periodOf(addDays(monday, i)).start),
    )
    expect([...starts]).toEqual(['2026-07-06'])
  })
})

describe('daysIn', () => {
  it('rend EXACTEMENT 14 jours, bornes incluses', () => {
    const d = daysIn(periodOf('2026-07-06'))
    expect(d).toHaveLength(14)
    expect(d[0]).toBe('2026-07-06')
    expect(d[13]).toBe('2026-07-19')
  })

  it('14 jours quelle que soit la periode — plus de 15/16 selon le mois', () => {
    for (let i = -400; i <= 400; i += 11) {
      expect(daysIn(periodOf(addDays(PERIOD_ANCHOR, i)))).toHaveLength(14)
    }
  })
})

describe('recentPeriods', () => {
  it('renvoie n periodes, la plus recente d abord, sans trou ni recouvrement', () => {
    const list = recentPeriods('2026-07-27', 4)
    expect(list.map((p) => `${p.start}→${p.end}`)).toEqual([
      '2026-07-20→2026-08-02',
      '2026-07-06→2026-07-19',
      '2026-06-22→2026-07-05',
      '2026-06-08→2026-06-21',
    ])
    // Chaque periode reprend exactement au lendemain de la precedente.
    for (let i = 1; i < list.length; i++) {
      expect(addDays(list[i].end, 1)).toBe(list[i - 1].start)
    }
  })

  it('26 periodes couvrent 364 jours — la cadence annuelle reelle, pas 24', () => {
    const list = recentPeriods('2026-07-27', 26)
    expect(list).toHaveLength(26)
    expect(list.at(-1)?.start).toBe(addDays(list[0].start, -25 * 14))
  })
})
