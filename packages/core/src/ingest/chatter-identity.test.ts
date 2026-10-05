import { beforeEach, describe, expect, it } from 'vitest'
import { resolveDayIdentity, type SaleLine, type SummaryLine } from './chatter-identity'
import { doublonKey, homonymeKey, type IdentityDirectoryEntry } from './identity-types'
import { norm, state, type F } from './identity.fixtures'

let n = 0
beforeEach(() => {
  n = 0
})
const run = (o: { fiches?: F[]; summary?: SummaryLine[]; sales?: SaleLine[]; directory?: [string, string][] }) =>
  resolveDayIdentity({
    day: '2026-09-06',
    summary: o.summary ?? [],
    sales: o.sales ?? [],
    directory: (o.directory ?? []).map(([mypulsUserId, label]): IdentityDirectoryEntry => ({ mypulsUserId, label })),
    state: state(o.fiches ?? []),
    norm,
    newId: () => `new-${++n}`,
  })

describe('resolveDayIdentity', () => {
  it('une vente suit l’id, même sous le libellé d’une autre fiche — doublon signalé, alias intact', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }, { id: 'B', name: 'lioneldiv' }],
      summary: [{ label: 'Lionel', ca: 12 }],
      sales: [{ label: 'lioneldiv', mypulsUserId: '1802', amount: 12 }],
      directory: [['1802', 'Lionel']],
    })
    expect(r.summaryChatter).toEqual(['A'])
    expect(r.summaryIds).toEqual(['1802'])
    expect(r.saleChatter).toEqual(['A'])
    expect(r.issues.map((i) => [i.kind, i.chatterId, i.otherChatterId])).toEqual([['doublon', 'A', 'B']])
    expect([r.newAliases, r.links]).toEqual([[], []])
  })

  it('résumé « City of the gamer » + vente « Cité des gamers », même id : la fiche du résumé reçoit l’id', () => {
    const r = run({
      fiches: [{ id: 'C', name: 'City of the gamer' }],
      summary: [{ label: 'City of the gamer', ca: 4.4 }],
      sales: [{ label: 'Cité des gamers', mypulsUserId: '9550', amount: 4.4 }],
      directory: [['9550', 'City of the gamer']],
    })
    expect(r.links).toEqual([{ chatterId: 'C', mypulsUserId: '9550' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['C'], ['C']])
    expect(r.newAliases).toEqual([{ chatterId: 'C', rawLabel: 'Cité des gamers', rawLabelNorm: 'citédesgamers' }])
    expect(r.issues).toEqual([])
  })

  it('correspondance exacte avant normalisation : « yann » = 1163', () => {
    const r = run({
      fiches: [{ id: 'Y', name: 'yann' }],
      summary: [{ label: 'yann', ca: 0 }],
      directory: [
        ['243', 'yann (accès révoqué)'],
        ['1163', 'yann (accès révoqué)'],
        ['1163', 'yann'],
      ],
    })
    expect(r.links).toEqual([{ chatterId: 'Y', mypulsUserId: '1163' }])
  })

  it('libellé ambigu départagé par le montant au centime (Serge → 10504) ; la fiche libre « Serge » (2 comptes) n’est pas reliée : homonyme', () => {
    const r = run({
      fiches: [{ id: 'S', name: 'Serge' }],
      summary: [{ label: 'Serge', ca: 70.79 }],
      sales: [{ label: 'Serge', mypulsUserId: '10504', amount: 70.79 }],
      directory: [
        ['9332', 'Serge'],
        ['10504', 'Serge'],
      ],
    })
    expect(r.summaryIds).toEqual(['10504'])
    expect(r.links).toEqual([])
    expect(r.newChatters).toEqual([{ id: 'new-1', displayName: 'Serge', mypulsUserId: '10504' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['new-1'], ['new-1']])
    expect(r.newAliases).toEqual([])
    expect(r.issues.map((i) => [i.kind, i.issueKey, i.chatterId])).toEqual([
      ['homonyme', homonymeKey('S'), 'S'],
      ['fiche_creee', 'fiche:10504', 'new-1'],
    ])
  })

  it('libellé ambigu NON départagé (CA 0) : mis de côté, aucune fiche créée, pas d’anomalie (rien de perdu)', () => {
    const r = run({ summary: [{ label: 'Serge', ca: 0 }], directory: [['9332', 'Serge'], ['10504', 'Serge']] })
    expect([r.summaryChatter, r.summaryIds]).toEqual([[null], [null]])
    expect(r.newChatters).toEqual([])
    expect(r.issues).toEqual([])
  })

  it('deux candidats au même montant : mis de côté ; les ventes suivent leur id', () => {
    const r = run({
      summary: [{ label: 'Serge', ca: 10 }],
      sales: [
        { label: 'Serge', mypulsUserId: '9332', amount: 10 },
        { label: 'Serge', mypulsUserId: '10504', amount: 10 },
      ],
    })
    expect(r.summaryChatter).toEqual([null])
    expect(r.saleChatter).toEqual(['new-1', 'new-2'])
    expect(r.newChatters.map((c) => c.mypulsUserId)).toEqual(['9332', '10504'])
    expect(r.issues.map((i) => i.kind).sort()).toEqual(['fiche_creee', 'fiche_creee', 'resume_mis_de_cote'])
  })

  it('homonyme déjà identifié : la fiche par alias porte un AUTRE id → nouvelle fiche, ni lien ni doublon', () => {
    const r = run({
      fiches: [{ id: 'S', name: 'Serge', mypulsId: '9332' }],
      summary: [{ label: 'Serge', ca: 70.79 }],
      sales: [{ label: 'Serge', mypulsUserId: '10504', amount: 70.79 }],
      directory: [['9332', 'Serge']],
    })
    expect(r.newChatters).toEqual([{ id: 'new-1', displayName: 'Serge', mypulsUserId: '10504' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['new-1'], ['new-1']])
    expect([r.newAliases, r.links]).toEqual([[], []])
    expect(r.issues.map((i) => i.kind)).toEqual(['fiche_creee'])
  })

  it('deux fiches libres : l’id va à celle reliée à un membre (la fiche payée), doublon signalé', () => {
    const r = run({
      fiches: [{ id: 'L1', name: 'Jordan', linked: true }, { id: 'L2', name: 'Jordan manager' }],
      summary: [{ label: 'JORDAN', ca: 5 }],
      sales: [{ label: 'Jordan manager', mypulsUserId: '296', amount: 5 }],
      directory: [['296', 'JORDAN']],
    })
    expect(r.links).toEqual([{ chatterId: 'L1', mypulsUserId: '296' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['L1'], ['L1']])
    expect(r.issues.map((i) => [i.kind, i.chatterId, i.otherChatterId])).toEqual([['doublon', 'L1', 'L2']])
  })

  it('deux fiches libres reliées chacune à un membre : rien n’est posé, anomalie, lignes par libellé', () => {
    const r = run({
      fiches: [
        { id: 'L1', name: 'Jordan', linked: true },
        { id: 'L2', name: 'Jordan manager', linked: true },
      ],
      summary: [{ label: 'JORDAN', ca: 5 }],
      sales: [{ label: 'Jordan manager', mypulsUserId: '296', amount: 5 }],
      directory: [['296', 'JORDAN']],
    })
    expect(r.links).toEqual([])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['L1'], ['L2']])
    expect(r.issues.map((i) => i.kind)).toEqual(['membres_multiples'])
  })

  it('compte inconnu : fiche créée AVEC son id, alias posé', () => {
    const r = run({ summary: [{ label: 'Nouveau', ca: 3 }], sales: [{ label: 'Nouveau', mypulsUserId: '777', amount: 3 }] })
    expect(r.newChatters).toEqual([{ id: 'new-1', displayName: 'Nouveau', mypulsUserId: '777' }])
    expect(r.newAliases).toEqual([{ chatterId: 'new-1', rawLabel: 'Nouveau', rawLabelNorm: 'nouveau' }])
    expect(r.issues.map((i) => [i.kind, i.issueKey])).toEqual([['fiche_creee', 'fiche:777']])
  })

  it('vente indéterminée : sa pseudo-fiche par alias, jamais d’id, pas d’alerte technique', () => {
    const r = run({
      fiches: [{ id: 'I', name: 'Indéterminé (Sarahcbr)' }, { id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 1 }],
      sales: [
        { label: 'Indéterminé (Sarahcbr)', mypulsUserId: null, amount: 38.32 },
        { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
      ],
    })
    expect(r.saleChatter).toEqual(['I', 'A'])
    expect([r.links, r.technical]).toEqual([[], []])
  })

  it('mode sans id (bouton disparu) : repli intégral sur les libellés, alerte technique, aucun lien', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }, { id: 'B', name: 'lioneldiv' }],
      summary: [{ label: 'Lionel', ca: 12 }],
      sales: [{ label: 'lioneldiv', mypulsUserId: null, amount: 12 }],
      directory: [['1802', 'Lionel']],
    })
    expect(r.noIds).toBe(true)
    expect(r.technical[0]).toMatch(/aucun id MyPuls/)
    expect([r.summaryChatter, r.saleChatter]).toEqual([['A'], ['B']])
    expect([r.links, r.issues]).toEqual([[], []])
  })

  it('vente sans id hors « Indéterminé » parmi des ventes identifiées : alerte technique nominative', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 1 }],
      sales: [
        { label: 'Bizarre', mypulsUserId: null, amount: 1 },
        { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
      ],
    })
    expect(r.technical.join(' ')).toContain('Bizarre')
  })

  it('écart à l’invariant : CA du résumé ≠ Σ ventes du même id → anomalie chiffrée', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 10 }],
      sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12.5 }],
    })
    expect(r.issues.map((i) => [i.kind, i.issueKey, i.amount])).toEqual([['ecart_invariant', 'ecart:2026-09-06:1802', 2.5]])
  })

  it('rejeu idempotent : une fois l’état à jour, rien de neuf', () => {
    const r = run({
      fiches: [{ id: 'C', name: 'City of the gamer', mypulsId: '9550', aliases: ['Cité des gamers'] }],
      summary: [{ label: 'City of the gamer', ca: 4.4 }],
      sales: [{ label: 'Cité des gamers', mypulsUserId: '9550', amount: 4.4 }],
      directory: [['9550', 'City of the gamer']],
    })
    expect([r.links, r.newAliases, r.newChatters, r.issues]).toEqual([[], [], [], []])
  })

  it('libellé vide au résumé → null, sans fiche', () => {
    expect(run({ summary: [{ label: '', ca: 0 }] }).summaryChatter).toEqual([null])
  })

  it('libellé « Indéterminé (…) » portant un id (anormal) : ni lien ni id, pseudo-fiche par libellé, alerte technique', () => {
    const r = run({
      fiches: [{ id: 'I', name: 'Indéterminé (Carla)' }, { id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [
        { label: 'Indéterminé (Carla)', ca: 5 },
        { label: 'Lionel', ca: 1 },
      ],
      sales: [
        { label: 'Indéterminé (Carla)', mypulsUserId: '4242', amount: 5 },
        { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
      ],
      directory: [['4243', 'Indéterminé (Carla)']],
    })
    expect(r.summaryIds).toEqual([null, '1802'])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['I', 'A'], ['I', 'A']])
    expect([r.links, r.newChatters, r.issues]).toEqual([[], [], []])
    expect(r.technical.join(' ')).toContain('Indéterminé (Carla)')
  })

  it('libellé « Indéterminé (…) » portant un id, sans pseudo-fiche : la fiche créée ne porte aucun id', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 1 }],
      sales: [
        { label: 'Indéterminé (Carla)', mypulsUserId: '4242', amount: 5 },
        { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
      ],
    })
    expect(r.newChatters).toEqual([{ id: 'new-1', displayName: 'Indéterminé (Carla)', mypulsUserId: null }])
    expect(r.saleChatter).toEqual(['new-1', 'A'])
    expect(r.links).toEqual([])
    expect(r.issues.filter((i) => i.mypulsUserId === '4242')).toEqual([])
  })
})

describe('resolveDayIdentity — cas discriminants (revue de la Task 7)', () => {
  it('deux fiches libres : la fiche reliée à un membre l’emporte même si elle n’est ni la première ni celle du résumé', () => {
    const r = run({
      fiches: [{ id: 'L1', name: 'Jordan' }, { id: 'L2', name: 'Jordan manager', linked: true }],
      summary: [{ label: 'JORDAN', ca: 5 }],
      sales: [{ label: 'Jordan manager', mypulsUserId: '296', amount: 5 }],
      directory: [['296', 'JORDAN']],
    })
    expect(r.links).toEqual([{ chatterId: 'L2', mypulsUserId: '296' }])
    expect([r.summaryChatter, r.saleChatter]).toEqual([['L2'], ['L2']])
    expect(r.issues.map((i) => [i.kind, i.issueKey, i.chatterId, i.otherChatterId])).toEqual([
      ['doublon', doublonKey('L1', 'L2'), 'L2', 'L1'],
    ])
  })

  it('mode sans id : le résumé ne passe PAS par l’annuaire, aucun lien posé', () => {
    const r = run({
      fiches: [{ id: 'C', name: 'City of the gamer' }],
      summary: [{ label: 'City of the gamer', ca: 4.4 }],
      sales: [{ label: 'Cité des gamers', mypulsUserId: null, amount: 4.4 }],
      directory: [['9550', 'City of the gamer']],
    })
    expect(r.noIds).toBe(true)
    expect(r.summaryIds).toEqual([null])
    expect(r.summaryChatter).toEqual(['C'])
    expect(r.links).toEqual([])
  })

  it('D3 « candidat non déjà pris » : l’id pris par une ligne non ambiguë est écarté du départage', () => {
    const r = run({
      summary: [
        { label: 'Serge B', ca: 10 },
        { label: 'Serge', ca: 10 },
      ],
      sales: [
        { label: 'Serge B', mypulsUserId: '9332', amount: 10 },
        { label: 'Serge', mypulsUserId: '10504', amount: 10 },
      ],
      directory: [
        ['9332', 'Serge B'],
        ['9332', 'Serge'],
        ['10504', 'Serge'],
      ],
    })
    expect(r.summaryIds).toEqual(['9332', '10504'])
  })

  it('D3 « CA > 0 » : une ligne à 0 € ne se départage pas, même avec un seul candidat à 0 € de ventes', () => {
    const r = run({
      summary: [{ label: 'Serge', ca: 0 }],
      sales: [{ label: 'Serge', mypulsUserId: '10504', amount: 5 }],
      directory: [
        ['9332', 'Serge'],
        ['10504', 'Serge'],
      ],
    })
    expect([r.summaryIds, r.summaryChatter]).toEqual([[null], [null]])
  })

  it('D3 « au centime » : 70,79 au résumé contre 70,78 de ventes → mis de côté', () => {
    const r = run({
      summary: [{ label: 'Serge', ca: 70.79 }],
      sales: [{ label: 'Serge', mypulsUserId: '9332', amount: 70.78 }],
      directory: [
        ['9332', 'Serge'],
        ['10504', 'Serge'],
      ],
    })
    expect([r.summaryIds, r.summaryChatter]).toEqual([[null], [null]])
    expect(r.issues.filter((i) => i.kind === 'resume_mis_de_cote').map((i) => i.amount)).toEqual([70.79])
  })

  it('D3 : le bon candidat est celui qui correspond au centime, pas le premier de la liste triée', () => {
    const r = run({
      summary: [{ label: 'Serge', ca: 70.79 }],
      sales: [{ label: 'Serge', mypulsUserId: '9332', amount: 70.79 }],
      directory: [
        ['9332', 'Serge'],
        ['10504', 'Serge'],
      ],
    })
    expect(r.summaryIds).toEqual(['9332'])
  })

  it('fiche par alias porteuse d’un AUTRE id : pas de doublon avec la fiche de l’id', () => {
    const r = run({
      fiches: [
        { id: 'A', name: 'Lionel', mypulsId: '1802' },
        { id: 'B', name: 'lioneldiv', mypulsId: '5555' },
      ],
      summary: [{ label: 'Lionel', ca: 12 }],
      sales: [{ label: 'lioneldiv', mypulsUserId: '1802', amount: 12 }],
      directory: [['1802', 'Lionel']],
    })
    expect(r.saleChatter).toEqual(['A'])
    expect([r.issues, r.links, r.newAliases]).toEqual([[], [], []])
  })

  it('deux lignes homonymes mises de côté le même jour : une anomalie, montants additionnés', () => {
    const r = run({
      summary: [
        { label: 'Serge', ca: 5 },
        { label: 'Serge', ca: 7 },
      ],
      directory: [
        ['9332', 'Serge'],
        ['10504', 'Serge'],
      ],
    })
    expect(r.summaryChatter).toEqual([null, null])
    expect(r.issues.map((i) => [i.kind, i.amount])).toEqual([['resume_mis_de_cote', 12]])
    expect(r.issues[0]!.detail).toContain('12,00 €')
  })

  it('deux lignes ambiguës qui visent le même seul candidat : aucune ne le prend, quel que soit l’ordre du résumé', () => {
    const summary: SummaryLine[] = [
      { label: 'Max', ca: 10 },
      { label: 'Maxi', ca: 10 },
    ]
    const o = {
      sales: [{ label: 'Max', mypulsUserId: '1', amount: 10 }],
      directory: [
        ['1', 'Max'],
        ['2', 'Max'],
        ['1', 'Maxi'],
        ['2', 'Maxi'],
      ] as [string, string][],
    }
    const a = run({ ...o, summary })
    n = 0
    const b = run({ ...o, summary: [...summary].reverse() })
    expect(a.summaryIds).toEqual([null, null])
    expect(b.summaryIds).toEqual([null, null])
  })

  it('plusieurs ids pour la même fiche libre : aucun lien, homonyme, une fiche par id — même résultat si l’ordre des ventes change', () => {
    const fiches: F[] = [{ id: 'F', name: 'Max', aliases: ['Maxime'] }]
    const sales: SaleLine[] = [
      { label: 'Max', mypulsUserId: '100', amount: 3 },
      { label: 'Maxime', mypulsUserId: '200', amount: 4 },
    ]
    const a = run({ fiches, sales })
    n = 0
    const b = run({ fiches, sales: [...sales].reverse() })
    expect(a.links).toEqual([])
    expect(a.newChatters).toEqual([
      { id: 'new-1', displayName: 'Max', mypulsUserId: '100' },
      { id: 'new-2', displayName: 'Maxime', mypulsUserId: '200' },
    ])
    expect(a.saleChatter).toEqual(['new-1', 'new-2'])
    expect(a.newAliases).toEqual([])
    expect(a.issues.filter((i) => i.kind === 'homonyme').map((i) => [i.issueKey, i.chatterId])).toEqual([[homonymeKey('F'), 'F']])
    expect({ ...b, saleChatter: [...b.saleChatter].reverse() }).toEqual(a)
  })

  it('jamais d’alias qui repointe une fiche connue par son seul nom', () => {
    const r = run({
      fiches: [{ id: 'S', name: 'Serge', mypulsId: '9332', byNameOnly: true }],
      sales: [{ label: 'Serge', mypulsUserId: '10504', amount: 3 }],
      summary: [{ label: 'Serge', ca: 3 }],
    })
    expect(r.newChatters).toEqual([{ id: 'new-1', displayName: 'Serge', mypulsUserId: '10504' }])
    expect(r.newAliases).toEqual([])
  })

  it('membres multiples : une ligne de l’id sans fiche par libellé est mise de côté, aucune fiche sans id créée', () => {
    const r = run({
      fiches: [
        { id: 'L1', name: 'Jordan', linked: true },
        { id: 'L2', name: 'Jordan manager', linked: true },
      ],
      summary: [{ label: 'JORDAN', ca: 7 }],
      sales: [
        { label: 'Jordan manager', mypulsUserId: '296', amount: 5 },
        { label: 'Jordy', mypulsUserId: '296', amount: 2 },
      ],
      directory: [['296', 'JORDAN']],
    })
    expect([r.summaryChatter, r.saleChatter]).toEqual([['L1'], ['L2', null]])
    expect(r.newChatters).toEqual([])
    expect(r.issues.map((i) => i.kind)).toEqual(['membres_multiples'])
  })

  it('jour où TOUTES les ventes sont « Indéterminé » : ce n’est pas un jour sans id, le résumé passe par l’annuaire', () => {
    const r = run({
      fiches: [{ id: 'I', name: 'Indéterminé (Sarahcbr)' }, { id: 'A', name: 'Lionel', mypulsId: '1802' }],
      summary: [{ label: 'Lionel', ca: 0 }],
      sales: [{ label: 'Indéterminé (Sarahcbr)', mypulsUserId: null, amount: 38.32 }],
      directory: [['1802', 'Lionel']],
    })
    expect([r.noIds, r.summaryIds, r.technical]).toEqual([false, ['1802'], []])
    expect(r.saleChatter).toEqual(['I'])
  })
})

describe('clés d’anomalie', () => {
  it('doublonKey ne dépend pas de l’ordre de la paire', () => {
    expect(doublonKey('b', 'a')).toBe(doublonKey('a', 'b'))
    expect(doublonKey('b', 'a')).toBe('doublon:a:b')
  })

  it('le doublon de la nuit porte la clé de la paire, sans l’id MyPuls : même ligne que le rattrapage', () => {
    const r = run({
      fiches: [{ id: 'A', name: 'Lionel', mypulsId: '1802' }, { id: 'B', name: 'lioneldiv' }],
      summary: [{ label: 'Lionel', ca: 12 }],
      sales: [{ label: 'lioneldiv', mypulsUserId: '1802', amount: 12 }],
      directory: [['1802', 'Lionel']],
    })
    expect(r.issues.map((i) => i.issueKey)).toEqual([doublonKey('B', 'A')])
  })
})
