import { describe, it, expect } from 'vitest'
import { historyWeekBounds } from './history-range'

describe('historyWeekBounds', () => {
  it('les semaines qui touchent la période : du lundi de la date de début jusqu’à la date de fin', () => {
    // Mois en cours au 12/10 : la semaine du 28/09 (qui déborde sur le 1er octobre) en fait partie.
    expect(historyWeekBounds({ from: '2026-10-01', to: '2026-10-12' })).toEqual({ fromWeek: '2026-09-28', toWeek: '2026-10-12' })
  })
  it('une période qui commence un lundi garde ce lundi', () => {
    expect(historyWeekBounds({ from: '2026-09-28', to: '2026-10-04' })).toEqual({ fromWeek: '2026-09-28', toWeek: '2026-10-04' })
  })
})
