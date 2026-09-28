import { describe, expect, it } from 'vitest'
import { parseListTab, splitEvents, untilLabel } from './event-list'
import type { AgencyEvent } from './month-layout'

const ev = (id: string, startDate: string, endDate = startDate): AgencyEvent => ({
  id, title: id, startDate, endDate, remindOnDay: false, audience: ['chatteur'], color: null, imagePath: null, imageUrl: null,
})
const ids = (list: AgencyEvent[]) => list.map((e) => e.id)
const TODAY = '2026-09-28'

describe('splitEvents', () => {
  it('aujourd\'hui : le jour même ET une période en cours, bornes comprises', () => {
    const { today } = splitEvents(
      [ev('jour', TODAY), ev('periode', '2026-09-25', '2026-10-02'), ev('finit', '2026-09-20', TODAY), ev('commence', TODAY, '2026-10-05')],
      TODAY,
    )
    expect(ids(today)).toEqual(['finit', 'periode', 'jour', 'commence'])
  })

  it('prochainement : pas encore commencé, dans l\'ordre d\'arrivée', () => {
    const { upcoming, today } = splitEvents([ev('loin', '2026-11-10'), ev('demain', '2026-09-29'), ev('bientot', '2026-10-03')], TODAY)
    expect(ids(upcoming)).toEqual(['demain', 'bientot', 'loin'])
    expect(today).toEqual([])
  })

  it('passé : fini la veille ou avant, du plus récent au plus ancien', () => {
    const { past, today } = splitEvents([ev('vieux', '2026-08-01'), ev('hier', '2026-09-27'), ev('periode', '2026-09-10', '2026-09-15')], TODAY)
    expect(ids(past)).toEqual(['hier', 'periode', 'vieux'])
    expect(today).toEqual([])
  })
})

describe('untilLabel', () => {
  it('demain, puis dans N jours', () => {
    expect(untilLabel('2026-09-29', TODAY)).toBe('demain')
    expect(untilLabel('2026-10-10', TODAY)).toBe('dans 12 jours')
  })
})

describe('parseListTab', () => {
  it('valeur connue gardée, le reste retombe sur « à venir »', () => {
    expect(parseListTab('passe')).toBe('passe')
    expect(parseListTab(undefined)).toBe('a-venir')
    expect(parseListTab('nimporte')).toBe('a-venir')
  })
})
