import { describe, expect, it } from 'vitest'
import {
  addMonths,
  currentWeekStart,
  frDateTimeParis,
  frMonthLong,
  frTimeShort,
  lastFullWeekStartFrom,
  lastWeekStart,
  todayParis,
} from './dates'

describe('frDateTimeParis', () => {
  it('affiche l’heure Paris (été, CEST = UTC+2)', () => {
    // 14:05 UTC le 16/07 = 16:05 à Paris (CEST)
    expect(frDateTimeParis('2026-07-16T14:05:00Z')).toBe('16/07 16:05')
  })
  it('affiche l’heure Paris (hiver, CET = UTC+1)', () => {
    // 14:05 UTC le 15/01 = 15:05 à Paris (CET)
    expect(frDateTimeParis('2026-01-15T14:05:00Z')).toBe('15/01 15:05')
  })
})

describe('todayParis', () => {
  it('bascule au jour suivant à minuit Paris, pas à minuit UTC (été, CEST = UTC+2)', () => {
    // 22:30 UTC le 15/07 = 00:30 à Paris le 16/07
    expect(todayParis(new Date('2026-07-15T22:30:00Z'))).toBe('2026-07-16')
    // 21:30 UTC le 15/07 = 23:30 à Paris le 15/07
    expect(todayParis(new Date('2026-07-15T21:30:00Z'))).toBe('2026-07-15')
  })
  it('gère l’heure d’hiver (CET = UTC+1)', () => {
    // 23:30 UTC le 15/01 = 00:30 à Paris le 16/01
    expect(todayParis(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16')
    expect(todayParis(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-15')
  })
  it('format YYYY-MM-DD', () => {
    expect(todayParis(new Date('2026-03-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('addMonths', () => {
  it('retourne le 1er du mois cible (quel que soit le jour de départ)', () => {
    expect(addMonths('2026-07-21', -1)).toBe('2026-06-01')
    expect(addMonths('2026-07-01', 0)).toBe('2026-07-01')
  })
  it('gère le passage d’année', () => {
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01')
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('frMonthLong', () => {
  it('affiche « mois année » en français', () => {
    expect(frMonthLong('2026-07-21')).toBe('juillet 2026')
    expect(frMonthLong('2026-01-01')).toBe('janvier 2026')
  })
})

describe('frTimeShort', () => {
  it('affiche « HH:MM » (heure locale → on teste le FORMAT, pas la valeur, le fuseau CI variant)', () => {
    expect(frTimeShort('2026-07-16T14:05:00Z')).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('semaines de référence', () => {
  it('currentWeekStart = lundi de la semaine du jour', () => {
    expect(currentWeekStart('2026-07-27')).toBe('2026-07-27') // un lundi
    expect(currentWeekStart('2026-07-26')).toBe('2026-07-20') // un dimanche
  })

  it('lastWeekStart = S-1 selon l’horloge (ce que montre le Bilan)', () => {
    expect(lastWeekStart('2026-07-27')).toBe('2026-07-20')
    expect(lastWeekStart('2026-07-31')).toBe('2026-07-20') // stable toute la semaine
  })

  it('lastFullWeekStartFrom garde la semaine du dernier jour SI son dimanche est ingéré', () => {
    expect(lastFullWeekStartFrom('2026-07-26')).toBe('2026-07-20') // dimanche ingéré
  })

  it('lastFullWeekStartFrom recule d’une semaine si la semaine est incomplète', () => {
    expect(lastFullWeekStartFrom('2026-07-21')).toBe('2026-07-13') // mardi → S-1 des données
    expect(lastFullWeekStartFrom('2026-07-20')).toBe('2026-07-13') // lundi seul
  })

  it('les deux S-1 COÏNCIDENT quand l’ingestion est à jour — cas de la prod', () => {
    // Lundi 27/07, données jusqu'au dimanche 26/07 : Bilan et Insights disent 2026-07-20.
    expect(lastFullWeekStartFrom('2026-07-26')).toBe(lastWeekStart('2026-07-27'))
  })

  it('les deux S-1 DIVERGENT quand l’ingestion a du retard — cas constaté sur l’UAT', () => {
    // Lundi 27/07, données arrêtées au mardi 21/07 : Insights 13/07, Bilan 20/07.
    expect(lastFullWeekStartFrom('2026-07-21')).toBe('2026-07-13')
    expect(lastWeekStart('2026-07-27')).toBe('2026-07-20')
  })
})
