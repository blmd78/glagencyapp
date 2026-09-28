import { describe, expect, it } from 'vitest'
import { AGENCY_ROLES, eventInput, eventRow, type EventInput } from './schema'

const base: EventInput = {
  title: 'Mise en avant Juliette', mode: 'jour', startDate: '2026-10-14', endDate: '2026-10-14',
  remindOnDay: false, audience: [...AGENCY_ROLES],
}

describe('eventInput', () => {
  it('accepte un jour', () => expect(eventInput.safeParse(base).success).toBe(true))

  it('accepte une période dont la fin suit le début', () => {
    expect(eventInput.safeParse({ ...base, mode: 'periode', endDate: '2026-10-16' }).success).toBe(true)
  })

  it('refuse une période qui finit avant de commencer, sur le champ de fin', () => {
    const r = eventInput.safeParse({ ...base, mode: 'periode', endDate: '2026-10-10' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['endDate'])
  })

  it('refuse un nom vide (espaces compris) et une audience vide', () => {
    expect(eventInput.safeParse({ ...base, title: '   ' }).success).toBe(false)
    expect(eventInput.safeParse({ ...base, audience: [] }).success).toBe(false)
  })

  it('refuse un rôle inconnu', () => {
    expect(eventInput.safeParse({ ...base, audience: ['admin'] }).success).toBe(false)
  })
})

describe('eventRow', () => {
  it('en mode Jour, la fin EST le début, même si une période avait été choisie avant', () => {
    expect(eventRow({ ...base, mode: 'jour', endDate: '2026-10-20' }).end_date).toBe('2026-10-14')
  })
  it('en mode Période, garde la fin choisie', () => {
    expect(eventRow({ ...base, mode: 'periode', endDate: '2026-10-20' }).end_date).toBe('2026-10-20')
  })
})
