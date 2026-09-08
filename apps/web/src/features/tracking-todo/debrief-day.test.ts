import { describe, expect, it } from 'vitest'
import { serviceDayParis } from '@glagency/core'
import { debriefLists, defaultDebriefDay } from './debrief-day'
import { weekStartOf } from './services/get-week'
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

// ————— Signalé le 2026-09-08 par un manager : « le bilan renseigné après minuit est
// comptabilisé sur la journée du lendemain ». Le choix du jour existait (2026-09-03), mais la
// valeur PROPOSÉE restait le jour civil. Ces deux cas fixent le comportement attendu bout en bout,
// `serviceDayParis` (core) branché sur `defaultDebriefDay`.
describe('le jour proposé après minuit — le bilan de la nuit', () => {
  it('à 02:52 un mardi, propose le lundi qu’on vient de finir', () => {
    // 00:52 UTC = 02:52 Paris le mardi 08 — le cas réel remonté ce jour-là.
    const service = serviceDayParis(new Date('2026-09-08T00:52:00Z'))
    expect(service).toBe('2026-09-07')
    expect(defaultDebriefDay(service, weekStartOf(service))).toBe('2026-09-07')
  })

  it('la nuit du DIMANCHE au lundi, propose le dimanche — dans la semaine qui le contient', () => {
    // Le cas qui ne marchait pas même en changeant le sélecteur : à 02:52 le lundi 07, la semaine
    // affichée était celle du 07 au 13, où le dimanche 06 n'existe pas.
    const service = serviceDayParis(new Date('2026-09-07T00:52:00Z'))
    expect(service).toBe('2026-09-06')
    expect(weekStartOf(service)).toBe('2026-08-31')
    expect(defaultDebriefDay(service, weekStartOf(service))).toBe('2026-09-06')
    // Et la preuve du bug : dans la semaine du jour CIVIL, le dimanche est hors bornes.
    expect(defaultDebriefDay(service, weekStartOf('2026-09-07'))).toBe('2026-09-07')
  })

  it('à 09:00, propose bien le jour même', () => {
    const service = serviceDayParis(new Date('2026-09-08T07:00:00Z'))
    expect(defaultDebriefDay(service, weekStartOf(service))).toBe('2026-09-08')
  })
})
