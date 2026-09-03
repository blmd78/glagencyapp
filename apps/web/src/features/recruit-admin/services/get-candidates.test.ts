import { describe, expect, it } from 'vitest'
import { parisDay } from '@glagency/core'
import { byQueueOrder, groupByDay, toCandidateRow } from './get-candidates'
import type { CandidateRow, CandidateStatus } from '../types'

/** Une ligne minimale : seuls jour de réception, note globale, QI et heure pèsent sur l'ordre. */
const row = (
  first: string,
  status: CandidateStatus,
  global: number,
  createdAt: string,
  qiScore = 0,
): CandidateRow =>
  ({ firstName: first, status, global, createdAt, day: parisDay(createdAt), qiScore }) as CandidateRow

const order = (rows: CandidateRow[]) => [...rows].sort(byQueueOrder).map((r) => r.firstName)

describe('byQueueOrder — ordre de la file des candidats', () => {
  it('sépare les JOURNÉES de réception, la plus récente en tête : deux sessions ne se mélangent pas', () => {
    const rows = [
      row('ancien-excellent', 'nouveau', 92, '2026-08-20T10:00:00Z'),
      row('récent-faible', 'nouveau', 41, '2026-08-25T10:00:00Z'),
      row('récent-moyen', 'nouveau', 67, '2026-08-25T09:00:00Z'),
    ]
    expect(order(rows)).toEqual(['récent-moyen', 'récent-faible', 'ancien-excellent'])
  })

  it('classe une journée par MEILLEURE NOTE, quel que soit le statut', () => {
    const rows = [
      row('nouveau-faible', 'nouveau', 44, '2026-08-25T10:00:00Z'),
      row('validé-excellent', 'valide', 98, '2026-08-25T11:00:00Z'),
      row('refusé-bon', 'refuse', 80, '2026-08-25T12:00:00Z'),
    ]
    expect(order(rows)).toEqual(['validé-excellent', 'refusé-bon', 'nouveau-faible'])
  })

  it('départage deux notes globales égales par le QI, puis par l’heure (plus récent d’abord)', () => {
    const rows = [
      row('qi-faible', 'nouveau', 78, '2026-08-25T12:00:00Z', 3),
      row('qi-fort', 'nouveau', 78, '2026-08-25T10:00:00Z', 5),
      row('qi-fort-récent', 'nouveau', 78, '2026-08-25T11:00:00Z', 5),
    ]
    expect(order(rows)).toEqual(['qi-fort-récent', 'qi-fort', 'qi-faible'])
  })

  it('coupe les journées à minuit PARIS, pas à minuit UTC', () => {
    // 21:59Z le 25 = 23:59 Paris le 25 ; 22:30Z le 25 = 00:30 Paris le 26.
    const rows = [
      row('veille-excellent', 'nouveau', 95, '2026-08-25T21:59:00Z'),
      row('lendemain-faible', 'nouveau', 30, '2026-08-25T22:30:00Z'),
    ]
    expect(order(rows)).toEqual(['lendemain-faible', 'veille-excellent'])
  })
})

describe('toCandidateRow — jour de réception', () => {
  it('pose le jour PARIS de `created_at`, coupé à minuit Paris', () => {
    // 22:30Z le 25 = 00:30 Paris le 26. Les autres colonnes ne pèsent pas sur le jour.
    const cols = { created_at: '2026-08-25T22:30:00Z', connection_mbps: '12.5', status: 'nouveau', profile_id: null }
    expect(toCandidateRow(cols as unknown as Parameters<typeof toCandidateRow>[0]).day).toBe('2026-08-26')
  })
})

describe('groupByDay — une section par journée de réception', () => {
  it('regroupe les lignes déjà triées par journée Paris, avec un libellé lisible', () => {
    const rows = [
      row('b', 'nouveau', 67, '2026-08-25T09:00:00Z'),
      row('a', 'nouveau', 41, '2026-08-25T21:59:00Z'),
      row('c', 'nouveau', 92, '2026-08-20T10:00:00Z'),
    ].sort(byQueueOrder)
    const days = groupByDay(rows)
    expect(days.map((d) => d.day)).toEqual(['2026-08-25', '2026-08-20'])
    expect(days.map((d) => d.label)).toEqual(['mardi 25 août', 'jeudi 20 août'])
    expect(days.map((d) => d.rows.map((r) => r.firstName))).toEqual([['b', 'a'], ['c']])
  })

  it('rend une liste vide sans journée', () => {
    expect(groupByDay([])).toEqual([])
  })
})
