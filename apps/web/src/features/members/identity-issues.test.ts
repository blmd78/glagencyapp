import { describe, expect, it } from 'vitest'
import { buildIdentityData, CHECK_LABEL } from './identity-issues'
import type { IdentityIssueRow, ReliabilityDay } from './types'

const row = (id: string, kind: IdentityIssueRow['kind'], lastSeenAt: string): IdentityIssueRow => ({
  id,
  kind,
  mypulsUserId: null,
  label: null,
  day: null,
  amount: null,
  detail: '',
  firstSeenAt: lastSeenAt,
  lastSeenAt,
  fiche: null,
  autre: null,
})
const dayOf = (day: string, status: ReliabilityDay['status']): ReliabilityDay => ({ day, status, checks: [], checkedAt: null })
const empty = { rows: [], sales: [], days: [], unranked: [] }

describe('buildIdentityData (onglet Fiches MyPuls)', () => {
  it('range chaque type d’anomalie dans sa section, la plus récente en tête', () => {
    const g = buildIdentityData({
      ...empty,
      rows: [
        row('1', 'doublon', '2026-09-01'),
        row('2', 'membres_multiples', '2026-09-30'),
        row('3', 'homonyme', '2026-09-02'),
        row('4', 'conflit_id', '2026-09-03'),
        row('5', 'fiche_creee', '2026-10-01'),
        row('6', 'resume_mis_de_cote', '2026-10-01'),
        row('7', 'ecart_invariant', '2026-10-01'),
      ],
    })
    expect(g.doubles.map((r) => r.id)).toEqual(['2', '4', '3', '1'])
    expect(g.nouvelles.map((r) => r.id)).toEqual(['5'])
    expect(g.montants.map((r) => r.id).sort()).toEqual(['6', '7'])
  })

  it('statut de fiabilité : le dernier jour en tête, l’historique du plus récent au plus ancien', () => {
    const g = buildIdentityData({ ...empty, days: [dayOf('2026-10-04', 'a_verifier'), dayOf('2026-10-03', 'ok')] })
    expect(g.reliability.latest?.status).toBe('a_verifier')
    expect(g.reliability.history.map((d) => d.day)).toEqual(['2026-10-04', '2026-10-03'])
    expect(buildIdentityData(empty).reliability.latest).toBeNull()
  })

  it('statut de fiabilité : le dernier relevé est le jour MAX, pas le premier reçu', () => {
    const g = buildIdentityData({
      ...empty,
      days: [dayOf('2026-10-02', 'ok'), dayOf('2026-10-04', 'a_verifier'), dayOf('2026-10-03', 'non_verifie')],
    })
    expect(g.reliability.latest?.day).toBe('2026-10-04')
    expect(g.reliability.history.map((d) => d.day)).toEqual(['2026-10-04', '2026-10-03', '2026-10-02'])
  })

  it('CA sans membre trié par CA ; ventes sans chatteur totalisées au centime', () => {
    const g = buildIdentityData({
      ...empty,
      unranked: [
        { chatterId: 'a', name: 'A', mypulsUserId: null, ca: 10, memberName: null, memberRole: null },
        { chatterId: 'b', name: 'B', mypulsUserId: '1', ca: 99, memberName: null, memberRole: null },
      ],
      sales: [
        { creatorName: 'Lena_dv', label: 'Indéterminé (Lena_dv)', ca: 0.1 },
        { creatorName: 'Carla', label: 'Indéterminé (Carla)', ca: 0.2 },
      ],
    })
    expect(g.unranked.map((u) => u.chatterId)).toEqual(['b', 'a'])
    expect(g.ventesSansChatteur).toEqual({
      total: 0.3,
      rows: [
        { creatorName: 'Carla', label: 'Indéterminé (Carla)', ca: 0.2 },
        { creatorName: 'Lena_dv', label: 'Indéterminé (Lena_dv)', ca: 0.1 },
      ],
    })
  })

  it('chaque code de contrôle a un libellé lisible', () => {
    for (const code of ['a_resume_ventes', 'b_resume_ecrit', 'b_ventes_ecrites', 'b_total_page', 'c_fiche_compte', 'c_lien_refuse']) {
      expect(CHECK_LABEL[code]).toBeTruthy()
    }
  })
})
