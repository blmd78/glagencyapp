import { describe, expect, it } from 'vitest'
import { debriefLists, defaultDebriefDay } from './debrief-day'
import type { TodoDay } from './types'

describe('defaultDebriefDay', () => {
  it("propose aujourd'hui quand il tombe dans la semaine affichée", () => {
    expect(defaultDebriefDay('2026-09-03', '2026-08-31')).toBe('2026-09-03')
  })
  it('propose le dimanche sur une semaine passée', () => {
    expect(defaultDebriefDay('2026-09-03', '2026-08-24')).toBe('2026-08-30')
  })
  it('propose le lundi sur une semaine à venir', () => {
    expect(defaultDebriefDay('2026-09-03', '2026-09-07')).toBe('2026-09-07')
  })
  it('garde les bornes : lundi et dimanche de la semaine affichée sont dedans', () => {
    expect(defaultDebriefDay('2026-08-31', '2026-08-31')).toBe('2026-08-31')
    expect(defaultDebriefDay('2026-09-06', '2026-08-31')).toBe('2026-09-06')
  })
})

const day = (date: string, tasks: { label: string; done: boolean }[]): TodoDay => ({
  date,
  weekdayLabel: 'lundi',
  dayLabel: '31/08',
  isToday: false,
  isWeekend: false,
  dayOff: false,
  sections: [
    {
      name: 'Général',
      recurring: false,
      tasks: tasks.map((t) => ({
        id: `${date}:${t.label}`,
        label: t.label,
        done: t.done,
        virtual: false,
        fromOther: false,
        depositedByMe: false,
        chatterId: null,
        hasBilan: false,
        chatterName: null,
      })),
    },
  ],
})

describe('debriefLists', () => {
  const days = [
    day('2026-08-31', [{ label: 'Relances', done: true }, { label: 'Scripts', done: false }]),
    day('2026-09-01', [{ label: '1:1 Kevin', done: true }]),
  ]
  it('sépare les tâches faites et pas faites du jour choisi', () => {
    expect(debriefLists(days, '2026-08-31')).toEqual({ done: ['Relances'], pending: ['Scripts'] })
  })
  it('ne mélange pas les jours', () => {
    expect(debriefLists(days, '2026-09-01')).toEqual({ done: ['1:1 Kevin'], pending: [] })
  })
  it('rend deux listes vides sur un jour absent de la semaine', () => {
    expect(debriefLists(days, '2026-09-20')).toEqual({ done: [], pending: [] })
  })
})
