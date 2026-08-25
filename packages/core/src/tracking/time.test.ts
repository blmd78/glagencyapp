import { describe, expect, it } from 'vitest'
import { dayBounds, fmtClock, fmtDuration, isoWeekday, parisDay, parisWallUtcMs } from './time'

describe('parisWallUtcMs', () => {
  it('heure d\'hiver : Paris = UTC+1', () => {
    // 2026-01-15 13:00 Paris = 12:00 UTC
    expect(new Date(parisWallUtcMs('2026-01-15', 13)).toISOString()).toBe('2026-01-15T12:00:00.000Z')
  })
  it('heure d\'été : Paris = UTC+2', () => {
    // 2026-08-25 13:00 Paris = 11:00 UTC
    expect(new Date(parisWallUtcMs('2026-08-25', 13)).toISOString()).toBe('2026-08-25T11:00:00.000Z')
  })
  it('jour de bascule été→hiver : 25 h, la borne reste juste', () => {
    // Bascule le dernier dimanche d'octobre 2026 = 25/10. 05h00 Paris ce jour-là = 04:00 UTC
    // (on est déjà repassé en UTC+1 à 03h00 locale).
    expect(new Date(parisWallUtcMs('2026-10-25', 5)).toISOString()).toBe('2026-10-25T04:00:00.000Z')
  })
  it('jour de bascule hiver→été : 23 h', () => {
    // Bascule le dernier dimanche de mars 2026 = 29/03. 13h00 Paris = 11:00 UTC (déjà UTC+2).
    expect(new Date(parisWallUtcMs('2026-03-29', 13)).toISOString()).toBe('2026-03-29T11:00:00.000Z')
  })
  it('minuit coïncide avec le début de journée', () => {
    expect(parisWallUtcMs('2026-08-25', 0)).toBe(dayBounds('2026-08-25').start)
  })
})

describe('dayBounds', () => {
  it('borne la journée Paris, fin exclusive', () => {
    const { start, end } = dayBounds('2026-08-25')
    expect(new Date(start).toISOString()).toBe('2026-08-24T22:00:00.000Z')
    expect(new Date(end).toISOString()).toBe('2026-08-25T22:00:00.000Z')
  })
})

describe('parisDay', () => {
  it('un instant de 0h30 Paris appartient au jour Paris, pas au jour UTC', () => {
    // 2026-08-25T00:30+02:00 = 2026-08-24T22:30Z → jour UTC = 24, jour Paris = 25
    expect(parisDay('2026-08-24T22:30:00.000Z')).toBe('2026-08-25')
  })
})

describe('isoWeekday', () => {
  it('1 = lundi, 7 = dimanche', () => {
    expect(isoWeekday('2026-08-24')).toBe(1)
    expect(isoWeekday('2026-08-25')).toBe(2)
    expect(isoWeekday('2026-08-30')).toBe(7)
  })
})

describe('formatage', () => {
  it('fmtDuration', () => {
    expect(fmtDuration(487)).toBe('8h07')
    expect(fmtDuration(45)).toBe('45min')
    expect(fmtDuration(0)).toBe('0min')
    expect(fmtDuration(-5)).toBe('0min')
    expect(fmtDuration(120)).toBe('2h00')
  })
  it('fmtClock rend l\'heure de Paris', () => {
    expect(fmtClock(Date.parse('2026-08-25T11:00:00Z'))).toBe('13:00')
    expect(fmtClock(null)).toBe('—')
  })
})
