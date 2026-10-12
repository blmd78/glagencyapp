import { describe, expect, it } from 'vitest'
import { moveTaskInDays, resolveDrop } from './move-task'
import type { TodoDay, TodoSection, TodoTask } from './types'

const task = (id: string): TodoTask => ({
  id,
  label: id,
  description: '',
  urgency: 'normale',
  done: false,
  virtual: false,
  fromOther: false,
  depositedByMe: false,
  chatterId: null,
  hasBilan: false,
  chatterName: null,
})

const section = (name: string, ids: string[], recurring = false): TodoSection => ({
  name,
  recurring,
  tasks: ids.map(task),
})

const day = (date: string, sections: TodoSection[]): TodoDay => ({
  date,
  weekdayLabel: 'lundi',
  dayLabel: '21/09',
  isToday: false,
  isWeekend: false,
  dayOff: false,
  sections,
})

const shape = (days: TodoDay[]) =>
  days.map((d) => [d.date, d.sections.map((s) => [s.name, s.tasks.map((t) => t.id)])])

describe('moveTaskInDays', () => {
  it('pose la tâche sur une journée VIDE, dans sa rubrique', () => {
    // Le cas qui ne marchait pas : une journée sans aucun groupe.
    const days = [day('2026-09-21', [section('À faire', ['a'])]), day('2026-09-22', [])]
    expect(shape(moveTaskInDays(days, 'a', '2026-09-22', 'À faire'))).toEqual([
      ['2026-09-21', []],
      ['2026-09-22', [['À faire', ['a']]]],
    ])
  })

  it('range la tâche à la fin du groupe existant de la journée visée', () => {
    const days = [
      day('2026-09-21', [section('À faire', ['a', 'b'])]),
      day('2026-09-22', [section('À faire', ['c'])]),
    ]
    expect(shape(moveTaskInDays(days, 'a', '2026-09-22', 'À faire'))).toEqual([
      ['2026-09-21', [['À faire', ['b']]]],
      ['2026-09-22', [['À faire', ['c', 'a']]]],
    ])
  })

  it('garde une section récurrente vidée — elle revient ce jour-là, tâches ou pas', () => {
    const days = [day('2026-09-21', [section('1:1', ['a'], true)]), day('2026-09-22', [])]
    expect(shape(moveTaskInDays(days, 'a', '2026-09-22', '1:1'))).toEqual([
      ['2026-09-21', [['1:1', []]]],
      ['2026-09-22', [['1:1', ['a']]]],
    ])
  })

  it('change de rubrique sans changer de jour', () => {
    const days = [day('2026-09-21', [section('À faire', ['a']), section('Scripts', [], true)])]
    expect(shape(moveTaskInDays(days, 'a', '2026-09-21', 'Scripts'))).toEqual([
      ['2026-09-21', [['Scripts', ['a']]]],
    ])
  })

  it('#161 — réordonne dans la même section : posée au-dessus de la tâche visée', () => {
    const days = [day('2026-09-21', [section('À faire', ['a', 'b', 'c'])])]
    expect(shape(moveTaskInDays(days, 'c', '2026-09-21', 'À faire', 'a'))).toEqual([
      ['2026-09-21', [['À faire', ['c', 'a', 'b']]]],
    ])
    expect(shape(moveTaskInDays(days, 'a', '2026-09-21', 'À faire', 'c'))).toEqual([
      ['2026-09-21', [['À faire', ['b', 'a', 'c']]]],
    ])
  })

  it('#161 — redescendre en bas de sa section (beforeId nul) garde la section, même seule', () => {
    const days = [day('2026-09-21', [section('À faire', ['a'])])]
    expect(shape(moveTaskInDays(days, 'a', '2026-09-21', 'À faire', null))).toEqual([
      ['2026-09-21', [['À faire', ['a']]]],
    ])
  })

  it('#161 — vers un autre jour, à un rang donné', () => {
    const days = [
      day('2026-09-21', [section('À faire', ['a'])]),
      day('2026-09-22', [section('À faire', ['b', 'c'])]),
    ]
    expect(shape(moveTaskInDays(days, 'a', '2026-09-22', 'À faire', 'c'))).toEqual([
      ['2026-09-21', []],
      ['2026-09-22', [['À faire', ['b', 'a', 'c']]]],
    ])
  })

  it('#161 — une cible disparue retombe en bas', () => {
    const days = [day('2026-09-21', [section('À faire', ['a', 'b'])])]
    expect(shape(moveTaskInDays(days, 'a', '2026-09-21', 'À faire', 'zzz'))).toEqual([
      ['2026-09-21', [['À faire', ['b', 'a']]]],
    ])
  })

  it('ne touche à rien si la tâche est introuvable', () => {
    const days = [day('2026-09-21', [section('À faire', ['a'])])]
    expect(moveTaskInDays(days, 'zzz', '2026-09-21', 'À faire')).toBe(days)
  })
})

describe('resolveDrop (#161)', () => {
  const days = [
    day('2026-09-21', [section('À faire', ['a', 'b', 'c']), section('Routine', ['r'])]),
    day('2026-09-22', [section('À faire', ['d'])]),
  ]
  const src = { date: '2026-09-21', category: 'À faire' }

  it('lâchée sur elle-même : rien', () => {
    expect(resolveDrop(days, 'b', src, { kind: 'task', date: '2026-09-21', category: 'À faire', taskId: 'b', after: false })).toBeNull()
  })

  it('moitié haute d’une tâche : au-dessus d’elle', () => {
    expect(resolveDrop(days, 'c', src, { kind: 'task', date: '2026-09-21', category: 'À faire', taskId: 'a', after: false }))
      .toEqual({ date: '2026-09-21', category: 'À faire', beforeId: 'a' })
  })

  it('moitié basse d’une tâche : au-dessus de la suivante (sans compter celle qu’on porte)', () => {
    expect(resolveDrop(days, 'c', src, { kind: 'task', date: '2026-09-21', category: 'À faire', taskId: 'a', after: true }))
      .toEqual({ date: '2026-09-21', category: 'À faire', beforeId: 'b' })
  })

  it('moitié basse de la dernière : en bas', () => {
    expect(resolveDrop(days, 'a', src, { kind: 'task', date: '2026-09-21', category: 'À faire', taskId: 'c', after: true }))
      .toEqual({ date: '2026-09-21', category: 'À faire', beforeId: null })
  })

  it('à sa propre place (sous la précédente) : rien', () => {
    expect(resolveDrop(days, 'b', src, { kind: 'task', date: '2026-09-21', category: 'À faire', taskId: 'a', after: true })).toBeNull()
    expect(resolveDrop(days, 'b', src, { kind: 'task', date: '2026-09-21', category: 'À faire', taskId: 'c', after: false })).toBeNull()
  })

  it('sur sa propre section quand elle est déjà en bas : rien', () => {
    expect(resolveDrop(days, 'c', src, { kind: 'section', date: '2026-09-21', category: 'À faire' })).toBeNull()
  })

  it('sur sa propre section depuis le haut : redescend en bas', () => {
    expect(resolveDrop(days, 'a', src, { kind: 'section', date: '2026-09-21', category: 'À faire' }))
      .toEqual({ date: '2026-09-21', category: 'À faire', beforeId: null })
  })

  it('sur une autre section du même jour : elle la rejoint (comportement gardé)', () => {
    expect(resolveDrop(days, 'a', src, { kind: 'section', date: '2026-09-21', category: 'Routine' }))
      .toEqual({ date: '2026-09-21', category: 'Routine', beforeId: null })
  })

  it('sur une autre journée (hors section) : garde sa rubrique, en bas', () => {
    expect(resolveDrop(days, 'a', src, { kind: 'day', date: '2026-09-22' }))
      .toEqual({ date: '2026-09-22', category: 'À faire', beforeId: null })
  })

  it('sur une tâche d’un autre jour : au-dessus d’elle', () => {
    expect(resolveDrop(days, 'a', src, { kind: 'task', date: '2026-09-22', category: 'À faire', taskId: 'd', after: false }))
      .toEqual({ date: '2026-09-22', category: 'À faire', beforeId: 'd' })
  })
})
