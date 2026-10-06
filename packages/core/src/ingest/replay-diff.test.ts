import { describe, expect, it } from 'vitest'
import { compareReplay, type ReplayIssue, type ReplaySnapshot } from './replay-diff'

const snap = (cd: Record<string, number>, ccd: Record<string, number>, fiches: ReplaySnapshot['fiches']): ReplaySnapshot => ({
  day: '2026-09-20',
  cd,
  ccd,
  fiches,
})
const fiches = {
  A: { name: 'Lionel', mypulsUserId: '1802' },
  B: { name: 'lioneldiv', mypulsUserId: null },
  X: { name: 'Autre', mypulsUserId: '5' },
}
const doublonAB: ReplayIssue = { kind: 'doublon', mypulsUserId: '1802', chatterId: 'A', otherChatterId: 'B', day: null, label: 'lioneldiv', amount: null }

describe('compareReplay — recette avant/après, jour par jour et fiche par fiche', () => {
  it('rien ne change → ok, aucun mouvement', () => {
    const s = snap({ A: 100 }, { A: 100 }, fiches)
    expect(compareReplay(s, s, [])).toMatchObject({ totalsOk: true, moves: [], ok: true })
  })

  it('doublon résolu : les ventes passent de B à A, totaux égaux → expliqué', () => {
    const d = compareReplay(snap({ A: 100 }, { B: 100 }, fiches), snap({ A: 100 }, { A: 100 }, fiches), [doublonAB])
    expect(d.ok).toBe(true)
    expect(d.moves.map((m) => [m.chatterId, m.dCcd, m.reason])).toEqual([
      ['A', 100, 'doublon résolu (id 1802)'],
      ['B', -100, 'doublon résolu (id 1802)'],
    ])
  })

  it('montant déplacé sans anomalie qui l’explique → INEXPLIQUÉ, jour refusé', () => {
    const d = compareReplay(snap({}, { X: 100 }, fiches), snap({}, { A: 100 }, fiches), [])
    expect(d.ok).toBe(false)
    expect(d.moves.every((m) => m.reason === null)).toBe(true)
  })

  it('total qui change → refusé ; sauf le montant d’un résumé mis de côté', () => {
    expect(compareReplay(snap({ A: 100 }, {}, fiches), snap({ A: 90 }, {}, fiches), []).totalsOk).toBe(false)
    const aside: ReplayIssue = { kind: 'resume_mis_de_cote', mypulsUserId: null, chatterId: null, otherChatterId: null, day: '2026-09-20', label: 'Lionel', amount: 1 }
    const d = compareReplay(snap({ A: 100 }, {}, fiches), snap({ A: 0 }, {}, fiches), [{ ...aside, amount: 1 }])
    expect(d.totalsOk).toBe(true)
    expect(d.moves[0]?.reason).toBe('résumé mis de côté (libellé ambigu)')
  })

  it('fiche créée pour un id par le nouveau code → expliqué', () => {
    const after = { ...fiches, N: { name: 'Serge', mypulsUserId: '10504' } }
    const d = compareReplay(snap({}, { X: 70 }, fiches), snap({}, { X: 0, N: 70 }, after), [
      { kind: 'fiche_creee', mypulsUserId: '10504', chatterId: 'N', otherChatterId: null, day: '2026-09-20', label: 'Serge', amount: null },
    ])
    expect(d.moves.find((m) => m.chatterId === 'N')?.reason).toBe("fiche créée pour l'id 10504")
  })
})

describe('compareReplay — homonymes séparés (recette UAT : toky, Augustin), les jours APRÈS la création', () => {
  // La fiche créée existe déjà dans la photo « avant » (créée au rejeu d'un jour précédent) : « fiche
  // créée » ne s'applique plus, c'est l'anomalie ouverte (son `day` = dernier jour vu) qui relie les fiches.
  const tokyFiches = {
    T: { name: 'toky', mypulsUserId: null },
    N1: { name: 'toky', mypulsUserId: '11005' },
    N2: { name: 'toky', mypulsUserId: '12768' },
    X: { name: 'Autre', mypulsUserId: '5' },
  }
  const tokyIssues: ReplayIssue[] = [
    { kind: 'homonyme', mypulsUserId: null, chatterId: 'T', otherChatterId: null, day: '2026-09-20', label: 'toky', amount: null },
    { kind: 'fiche_creee', mypulsUserId: '11005', chatterId: 'N1', otherChatterId: 'T', day: '2026-09-14', label: 'toky', amount: null },
    { kind: 'fiche_creee', mypulsUserId: '12768', chatterId: 'N2', otherChatterId: 'T', day: '2026-09-14', label: 'toky', amount: null },
  ]

  it('« toky » : T perd, N1 et N2 gagnent → expliqué par les fiches créées reliées à T', () => {
    const d = compareReplay(
      snap({ T: 800 }, { T: 800 }, tokyFiches),
      snap({ N1: 500, N2: 300 }, { N1: 500, N2: 300 }, tokyFiches),
      tokyIssues,
    )
    expect(d.ok).toBe(true)
    expect(d.moves.map((m) => [m.chatterId, m.reason])).toEqual([
      ['N1', "homonyme séparé : fiche créée pour l'id 11005"],
      ['N2', "homonyme séparé : fiche créée pour l'id 12768"],
      ['T', "homonyme séparé : fiche créée pour l'id 11005"],
    ])
  })

  it('« Augustin » : la fiche de 2734 perd, celle de 11835 gagne → expliqué (fiche_creee, dans un sens comme dans l’autre)', () => {
    const f = { AU: { name: 'Augustin', mypulsUserId: '2734' }, N: { name: 'Augustin', mypulsUserId: '11835' } }
    const creee: ReplayIssue = { kind: 'fiche_creee', mypulsUserId: '11835', chatterId: 'N', otherChatterId: 'AU', day: '2026-09-15', label: 'Augustin', amount: null }
    expect(compareReplay(snap({ AU: 1000 }, {}, f), snap({ AU: 400, N: 600 }, {}, f), [creee]).ok).toBe(true)
    // Sens inverse (N rend à AU) : même lien.
    expect(compareReplay(snap({ N: 600 }, {}, f), snap({ AU: 600 }, {}, f), [creee]).ok).toBe(true)
  })

  it('homonyme qui relie les deux fiches (chatterId / otherChatterId inversés) → expliqué', () => {
    const issue: ReplayIssue = { kind: 'homonyme', mypulsUserId: null, chatterId: 'N1', otherChatterId: 'T', day: null, label: 'toky', amount: null }
    const d = compareReplay(snap({}, { T: 70 }, tokyFiches), snap({}, { N1: 70 }, tokyFiches), [issue])
    expect(d.ok).toBe(true)
    expect(d.moves.map((m) => m.reason)).toEqual(['homonyme séparé (« toky »)', 'homonyme séparé (« toky »)'])
  })

  it('mouvement sans rapport (X → N1) malgré le lien T ↔ N1 → INEXPLIQUÉ, jour refusé', () => {
    const d = compareReplay(snap({}, { X: 70 }, tokyFiches), snap({}, { N1: 70 }, tokyFiches), tokyIssues)
    expect(d.moves.map((m) => [m.chatterId, m.reason])).toEqual([
      ['N1', null],
      ['X', null],
    ])
    expect(d.ok).toBe(false)
  })

  it('fiches reliées qui bougent dans le même sens → INEXPLIQUÉ (le lien n’explique qu’un passage de l’une à l’autre)', () => {
    const d = compareReplay(snap({}, { X: 100 }, tokyFiches), snap({}, { T: 30, N1: 70 }, tokyFiches), tokyIssues)
    expect(d.moves.find((m) => m.chatterId === 'T')?.reason).toBeNull()
    expect(d.ok).toBe(false)
  })

  it('le lien n’excuse pas un total qui change', () => {
    const d = compareReplay(snap({ T: 800 }, {}, tokyFiches), snap({ N1: 700 }, {}, tokyFiches), tokyIssues)
    expect(d.totalsOk).toBe(false)
    expect(d.ok).toBe(false)
  })
})

describe('compareReplay — garde-fous complémentaires', () => {
  it('fiche créée : X perd 70 sans raison propre → INEXPLIQUÉ, jour refusé', () => {
    const after = { ...fiches, N: { name: 'Serge', mypulsUserId: '10504' } }
    const d = compareReplay(snap({}, { X: 70 }, fiches), snap({}, { X: 0, N: 70 }, after), [])
    expect(d.moves.find((m) => m.chatterId === 'X')).toMatchObject({ dCcd: -70, reason: null })
    expect(d.ok).toBe(false)
  })

  it('id posé sur une fiche qui n’en avait pas → expliqué', () => {
    const after = { ...fiches, B: { name: 'lioneldiv', mypulsUserId: '77' } }
    const d = compareReplay(snap({ B: 50 }, {}, fiches), snap({ B: 80 }, {}, after), [])
    expect(d.moves[0]).toMatchObject({ chatterId: 'B', dCd: 30, reason: 'id 77 posé' })
  })

  it('deux membres reliés au même compte → expliqué', () => {
    const issue: ReplayIssue = { kind: 'membres_multiples', mypulsUserId: '1802', chatterId: 'A', otherChatterId: 'X', day: null, label: null, amount: null }
    const d = compareReplay(snap({}, { X: 40 }, fiches), snap({}, { A: 40 }, fiches), [issue])
    expect(d.ok).toBe(true)
    expect(d.moves.map((m) => m.reason)).toEqual(['deux membres reliés au même compte', 'deux membres reliés au même compte'])
  })

  it('résumé mis de côté un AUTRE jour : ne compense pas le total de ce jour', () => {
    const aside: ReplayIssue = { kind: 'resume_mis_de_cote', mypulsUserId: null, chatterId: null, otherChatterId: null, day: '2026-09-19', label: 'Lionel', amount: 1 }
    const d = compareReplay(snap({ A: 100 }, {}, fiches), snap({ A: 0 }, {}, fiches), [aside])
    expect(d.asideCents).toBe(0)
    expect(d.totalsOk).toBe(false)
    expect(d.ok).toBe(false)
  })

  it('total de chatter_creator_daily qui change → refusé (aucun montant de côté ne le couvre)', () => {
    const aside: ReplayIssue = { kind: 'resume_mis_de_cote', mypulsUserId: null, chatterId: null, otherChatterId: null, day: '2026-09-20', label: 'Lionel', amount: 1 }
    const d = compareReplay(snap({}, { A: 100 }, fiches), snap({}, { A: 0 }, fiches), [aside])
    expect(d.totalsOk).toBe(false)
    expect(d.ok).toBe(false)
  })

  it('montants de côté en euros → centimes entiers (12,34 € = 1234)', () => {
    const aside: ReplayIssue = { kind: 'resume_mis_de_cote', mypulsUserId: null, chatterId: null, otherChatterId: null, day: '2026-09-20', label: 'Lionel', amount: 12.34 }
    const d = compareReplay(snap({ A: 1234 }, {}, fiches), snap({ A: 0 }, {}, fiches), [aside])
    expect(d.asideCents).toBe(1234)
    expect(d.totalsOk).toBe(true)
  })

  it('sortie déterministe : mouvements triés par id de fiche, quel que soit l’ordre des clés', () => {
    const d = compareReplay(snap({ X: 1, A: 1 }, {}, fiches), snap({ A: 2, X: 2 }, {}, fiches), [])
    expect(d.moves.map((m) => m.chatterId)).toEqual(['A', 'X'])
  })

  it('une fiche absente de `fiches` ne casse pas : nom = id, id MyPuls null', () => {
    const d = compareReplay(snap({ Z: 10 }, {}, {}), snap({ Z: 20 }, {}, {}), [])
    expect(d.moves[0]).toMatchObject({ chatterId: 'Z', name: 'Z', mypulsUserId: null, dCd: 10, reason: null })
  })
})
