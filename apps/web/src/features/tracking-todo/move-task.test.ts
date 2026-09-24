import { describe, expect, it } from 'vitest'
import { moveTaskInDays } from './move-task'
import type { TodoDay, TodoSection, TodoTask } from './types'

const task = (id: string): TodoTask => ({
  id,
  label: id,
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

  it('ne touche à rien si la tâche est introuvable', () => {
    const days = [day('2026-09-21', [section('À faire', ['a'])])]
    expect(moveTaskInDays(days, 'zzz', '2026-09-21', 'À faire')).toBe(days)
  })
})
