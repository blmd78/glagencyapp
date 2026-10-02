import { describe, expect, it } from 'vitest'
import { layoutMonth, monthGrid, parseMonth, shiftMonth, type AgencyEvent } from './month-layout'

const ev = (id: string, startDate: string, endDate = startDate): AgencyEvent => ({
  id, title: id, startDate, endDate, remindOnDay: false, audience: ['chatteur'], color: null, imagePath: null, imageUrl: null, kind: null, creatorId: null, creatorName: null, creatorAvatarUrl: null,
})
const rowOf = (weeks: ReturnType<typeof layoutMonth>, day: string) => weeks.find((w) => w.days.includes(day))!

describe('monthGrid', () => {
  it('octobre 2026 : du lundi 28/09 au dimanche 01/11', () => {
    expect(monthGrid('2026-10')).toEqual({ start: '2026-09-28', end: '2026-11-01' })
  })
})

describe('layoutMonth', () => {
  it('5 semaines de 7 jours pour octobre 2026', () => {
    const weeks = layoutMonth('2026-10', [])
    expect(weeks).toHaveLength(5)
    expect(weeks.every((w) => w.days.length === 7)).toBe(true)
  })

  it('un jour seul : une barre d\'une case, dans la bonne colonne', () => {
    const w = rowOf(layoutMonth('2026-10', [ev('a', '2026-10-14')]), '2026-10-14')
    expect(w.bars).toEqual([expect.objectContaining({ startCol: 2, span: 1, lane: 0, continuesBefore: false, continuesAfter: false })])
  })

  it('une période à cheval sur deux semaines se coupe en deux barres', () => {
    const weeks = layoutMonth('2026-10', [ev('a', '2026-10-17', '2026-10-20')])
    expect(rowOf(weeks, '2026-10-17').bars[0]).toMatchObject({ startCol: 5, span: 2, continuesAfter: true })
    expect(rowOf(weeks, '2026-10-20').bars[0]).toMatchObject({ startCol: 0, span: 2, continuesBefore: true })
  })

  it('une période qui commence avant le mois s\'affiche dès la 1re case de la grille', () => {
    const w = rowOf(layoutMonth('2026-10', [ev('a', '2026-09-20', '2026-09-29')]), '2026-09-28')
    expect(w.bars[0]).toMatchObject({ startCol: 0, span: 2, continuesBefore: true, continuesAfter: false })
  })

  it('deux événements le même jour s\'empilent sur deux lignes', () => {
    const w = rowOf(layoutMonth('2026-10', [ev('a', '2026-10-14'), ev('b', '2026-10-14')]), '2026-10-14')
    expect(w.bars.map((b) => b.lane).sort()).toEqual([0, 1])
    expect(w.lanes).toBe(2)
  })

  it('ignore un événement hors de la grille', () => {
    expect(layoutMonth('2026-10', [ev('a', '2026-12-01')]).every((w) => w.bars.length === 0)).toBe(true)
  })
})

describe('parseMonth / shiftMonth', () => {
  it('garde un mois valide, sinon le mois du jour', () => {
    expect(parseMonth('2026-11', '2026-09-25')).toBe('2026-11')
    expect(parseMonth('2026-13', '2026-09-25')).toBe('2026-09')
    expect(parseMonth(undefined, '2026-09-25')).toBe('2026-09')
  })
  it('passe l\'année dans les deux sens', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})
