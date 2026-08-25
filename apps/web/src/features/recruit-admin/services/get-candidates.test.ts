import { describe, expect, it } from 'vitest'
import { byQueueOrder } from './get-candidates'
import type { CandidateRow, CandidateStatus } from '../types'

/** Une ligne minimale : seuls statut, note et date pèsent sur l'ordre. */
const row = (first: string, status: CandidateStatus, global: number, createdAt: string): CandidateRow =>
  ({ firstName: first, status, global, createdAt }) as CandidateRow

const order = (rows: CandidateRow[]) => [...rows].sort(byQueueOrder).map((r) => r.firstName)

describe('byQueueOrder — ordre de la file des candidats', () => {
  it('classe par MEILLEURE NOTE, pas par date de réception', () => {
    const rows = [
      row('faible', 'nouveau', 41, '2026-08-25T10:00:00Z'),
      row('meilleur', 'nouveau', 92, '2026-08-20T10:00:00Z'),
      row('moyen', 'nouveau', 67, '2026-08-24T10:00:00Z'),
    ]
    // Le mieux noté en tête, même s'il est le plus ancien.
    expect(order(rows)).toEqual(['meilleur', 'moyen', 'faible'])
  })

  it('garde les NOUVEAUX au-dessus des dossiers déjà tranchés, même moins bien notés', () => {
    const rows = [
      row('validé-excellent', 'valide', 98, '2026-08-25T10:00:00Z'),
      row('nouveau-faible', 'nouveau', 44, '2026-08-25T10:00:00Z'),
      row('refusé-bon', 'refuse', 80, '2026-08-25T10:00:00Z'),
    ]
    // C'est une FILE DE TRAITEMENT : ce qui reste à décider passe devant ce qui est décidé.
    expect(order(rows)).toEqual(['nouveau-faible', 'validé-excellent', 'refusé-bon'])
  })

  it('départage deux notes égales par la date, du plus récent au plus ancien', () => {
    const rows = [
      row('ancien', 'nouveau', 78, '2026-08-20T10:00:00Z'),
      row('récent', 'nouveau', 78, '2026-08-25T10:00:00Z'),
    ]
    expect(order(rows)).toEqual(['récent', 'ancien'])
  })
})
