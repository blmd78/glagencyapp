import { describe, expect, it } from 'vitest'
import {
  conflitKey,
  homonymeKey,
  identityIssueRow,
  labelIndex,
  membresKey,
  type IdentityDirectoryEntry,
} from './identity-types'
import {
  ficheIds,
  parseLot,
  planIdentityBackfill,
  proveGroup,
  proveLot,
  NO_FACTS,
  type BackfillFiche,
  type FicheFacts,
} from './identity-backfill'
import { norm } from './identity.fixtures'

const fiche = (id: string, displayName: string, over: Partial<BackfillFiche> = {}): BackfillFiche => ({
  id,
  displayName,
  email: null,
  mypulsUserId: null,
  linked: false,
  activity: 0,
  aliases: [],
  ...over,
})
const dir = (pairs: [string, string][]): IdentityDirectoryEntry[] =>
  pairs.map(([mypulsUserId, label]) => ({ mypulsUserId, label }))
const plan = (fiches: BackfillFiche[], pairs: [string, string][]) =>
  planIdentityBackfill({ fiches, directory: dir(pairs), norm })
const facts = (cd: [string, number][], ccd: [string, string, number][] = []): FicheFacts => {
  const sums = new Map<string, number>()
  for (const [, day, c] of ccd) sums.set(day, (sums.get(day) ?? 0) + c)
  return { cd: new Map(cd), ccd: sums, ccdKeys: new Set(ccd.map(([cr, day]) => `${cr}|${day}`)) }
}
const ids = (...xs: string[]) => new Set(xs)

describe('labelIndex', () => {
  it('la correspondance EXACTE unique l’emporte sur la clé normalisée ambiguë', () => {
    const idx = labelIndex(
      dir([
        ['243', 'yann (accès révoqué)'],
        ['1163', 'yann (accès révoqué)'],
        ['1163', 'yann'],
      ]),
      norm,
    )
    expect([...idx.idsOf('yann')]).toEqual(['1163'])
    expect([...idx.idsOf('Yann')].sort()).toEqual(['1163', '243'])
    expect(idx.idsOf('inconnu').size).toBe(0)
  })
})

describe('planIdentityBackfill (rapport, lecture seule)', () => {
  it('signale une fiche sans id qui correspond à un seul compte', () => {
    expect(plan([fiche('A', 'Lionel')], [['1802', 'Lionel']]).links).toEqual([{ chatterId: 'A', mypulsUserId: '1802' }])
  })

  it('candidat de fusion : cible = fiche reliée à un membre, même si l’autre a plus d’activité', () => {
    const p = plan(
      [fiche('A', 'Lionel', { activity: 100 }), fiche('B', 'lioneldiv', { linked: true, activity: 1 })],
      [
        ['1802', 'Lionel'],
        ['1802', 'lioneldiv'],
      ],
    )
    expect(p.merges).toEqual([{ keep: 'B', old: 'A', mypulsUserId: '1802' }])
  })

  it('sans membre : cible = fiche qui porte déjà l’id ; sinon la plus active', () => {
    expect(
      plan([fiche('A', 'Ornela', { mypulsUserId: '5614' }), fiche('B', 'Ornella', { activity: 99 })], [['5614', 'Ornella']]).merges,
    ).toEqual([{ keep: 'A', old: 'B', mypulsUserId: '5614' }])
    expect(
      plan(
        [fiche('A', 'Marek', { activity: 5 }), fiche('B', 'Marek_17', { activity: 50 })],
        [
          ['11391', 'Marek'],
          ['11391', 'Marek_17'],
        ],
      ).merges,
    ).toEqual([{ keep: 'B', old: 'A', mypulsUserId: '11391' }])
  })

  it('deux fiches reliées → aucune candidate, anomalie membres_multiples', () => {
    const p = plan(
      [fiche('A', 'JORDAN', { linked: true }), fiche('B', 'Jordan manager', { linked: true })],
      [
        ['296', 'JORDAN'],
        ['296', 'Jordan manager'],
      ],
    )
    expect(p.merges).toEqual([])
    expect(p.issues.map((i) => i.kind)).toEqual(['membres_multiples'])
    expect(p.issues.map((i) => i.issueKey)).toEqual([membresKey('296')])
  })

  it('homonymes mélangés et id contredit → anomalies, rien d’autre', () => {
    expect(plan([fiche('S', 'Serge')], [['9332', 'Serge'], ['10504', 'Serge']]).issues.map((i) => i.kind)).toEqual(['homonyme'])
    expect(plan([fiche('S', 'Serge', { mypulsUserId: '9332' })], [['10504', 'Serge']]).issues.map((i) => i.kind)).toEqual([
      'conflit_id',
    ])
  })

  it('clés d’anomalie : celles des constructeurs partagés avec la résolution de la nuit', () => {
    expect(plan([fiche('S', 'Serge')], [['9332', 'Serge'], ['10504', 'Serge']]).issues.map((i) => i.issueKey)).toEqual([
      homonymeKey('S'),
    ])
    expect(plan([fiche('S', 'Serge', { mypulsUserId: '9332' })], [['10504', 'Serge']]).issues.map((i) => i.issueKey)).toEqual([
      conflitKey('S'),
    ])
    expect([homonymeKey('S'), conflitKey('S'), membresKey('296')]).toEqual(['homonyme:S', 'conflit:S', 'membres:296'])
  })

  it('fiches corrompues à part ; pseudo-fiches « Indéterminé (…) » jamais touchées', () => {
    const p = plan(
      [fiche('X', 'Amed\n                Aucune vente sur la période'), fiche('I', 'Indéterminé (Carla)')],
      [['5', 'Indéterminé (Carla)']],
    )
    expect(p.corrupted).toEqual(['X'])
    expect([p.links, p.merges]).toEqual([[], []])
  })

  it('rapproche par l’e-mail (nom de fiche ou colonne email)', () => {
    const p = plan(
      [fiche('E', 'delgazo613@gmail.com'), fiche('F', 'Fred', { email: 'fred@x.fr' })],
      [
        ['8022', 'delgazo613@gmail.com'],
        ['9', 'fred@x.fr'],
      ],
    )
    expect(p.links.map((l) => l.chatterId)).toEqual(['E', 'F'])
  })
})

describe('ficheIds', () => {
  it('id porté ∪ ids désignés par les libellés', () => {
    const m = ficheIds({ fiches: [fiche('A', 'lioneldiv', { mypulsUserId: '1802' })], directory: dir([['1802', 'lioneldiv']]), norm })
    expect([...m.get('A')!]).toEqual(['1802'])
  })

  it('pseudo-fiche « Indéterminé (…) » : jamais d’id, même si l’annuaire porte son libellé ou qu’elle en porte un', () => {
    const m = ficheIds({
      fiches: [fiche('I', 'Indéterminé (Carla)'), fiche('J', 'Indéterminé (Lola)', { mypulsUserId: '7' })],
      directory: dir([
        ['5', 'Indéterminé (Carla)'],
        ['7', 'Indéterminé (Lola)'],
      ]),
      norm,
    })
    expect(m.get('I')!.size).toBe(0)
    expect(m.get('J')!.size).toBe(0)
  })
})

describe('proveGroup — la double preuve (même id + compensation au centime)', () => {
  it('cas Lionel : le résumé sur une fiche, les ventes sur l’autre → prouvé', () => {
    const p = proveGroup({
      keep: { facts: facts([['2026-09-06', 14657]]), ids: ids('1802') },
      olds: [{ facts: facts([], [['claire', '2026-09-06', 14657]]), ids: ids('1802') }],
    })
    expect(p).toEqual({ ok: true, mypulsUserId: '1802', reasons: [], daysChecked: 1 })
  })

  it('trois fiches : une paire seule ne compense pas, le groupe oui', () => {
    const keep = { facts: facts([['d1', 3000]]), ids: ids('1163') }
    const old1 = { facts: facts([], [['lola', 'd1', 1000]]), ids: ids('1163') }
    const old2 = { facts: facts([], [['claire', 'd1', 2000]]), ids: ids('1163') }
    expect(proveGroup({ keep, olds: [old1] }).ok).toBe(false)
    expect(proveGroup({ keep, olds: [old1, old2] }).ok).toBe(true)
  })

  it('refus : jour en commun, ids différents, id non établi, id attendu contredit', () => {
    expect(
      proveGroup({ keep: { facts: facts([['d1', 100]]), ids: ids('1') }, olds: [{ facts: facts([['d1', 100]]), ids: ids('1') }] }).reasons.join(' '),
    ).toContain('jour(s) en commun')
    expect(proveGroup({ keep: { facts: NO_FACTS, ids: ids('1') }, olds: [{ facts: NO_FACTS, ids: ids('2') }] }).reasons.join(' ')).toContain(
      'ids MyPuls différents',
    )
    expect(proveGroup({ keep: { facts: NO_FACTS, ids: ids('1') }, olds: [{ facts: NO_FACTS, ids: ids() }] }).ok).toBe(false)
    expect(
      proveGroup({ keep: { facts: NO_FACTS, ids: ids('1') }, olds: [{ facts: NO_FACTS, ids: ids('1') }], expectedId: '2' }).ok,
    ).toBe(false)
  })
})

describe('proveGroup — cas limites verrouillés', () => {
  it('même (modèle, jour) dans chatter_creator_daily chez deux fiches → refus', () => {
    const p = proveGroup({
      keep: { facts: facts([], [['claire', 'd1', 100]]), ids: ids('1') },
      olds: [{ facts: facts([], [['claire', 'd1', 100]]), ids: ids('1') }],
    })
    expect(p.ok).toBe(false)
    expect(p.reasons.join(' ')).toContain('(modèle, jour) en commun')
  })

  it('même jour mais modèles différents : pas un doublon, la compensation décide', () => {
    const p = proveGroup({
      keep: { facts: facts([['d1', 200]], [['claire', 'd1', 100]]), ids: ids('1') },
      olds: [{ facts: facts([], [['lola', 'd1', 100]]), ids: ids('1') }],
    })
    expect(p).toEqual({ ok: true, mypulsUserId: '1', reasons: [], daysChecked: 1 })
  })

  it('jour en commun entre deux fiches à vider (la fiche gardée n’en a pas) → refus', () => {
    const p = proveGroup({
      keep: { facts: NO_FACTS, ids: ids('1') },
      olds: [
        { facts: facts([['d1', 100]]), ids: ids('1') },
        { facts: facts([['d1', 100]]), ids: ids('1') },
      ],
    })
    expect(p.ok).toBe(false)
    expect(p.reasons.join(' ')).toContain('jour(s) en commun')
  })
})

describe('parseLot', () => {
  const head = 'action,slug,garder,vider,id_attendu\n'
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

  it('lit fusions et suppressions, ignore commentaires et en-tête', () => {
    expect(parseLot(`# lot\n${head}fusionner,yann,${A},${B},1163\nsupprimer,amed,,${C},\n`)).toEqual([
      { line: 3, action: 'fusionner', slug: 'yann', keep: A, old: B, expectedId: '1163' },
      { line: 4, action: 'supprimer', slug: 'amed', keep: null, old: C, expectedId: null },
    ])
  })

  it('refuse : action inconnue, fiche vidée deux fois, fiche gardée vidée ailleurs', () => {
    expect(() => parseLot(`${head}fondre,x,${A},${B},\n`)).toThrow(/action/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B},\nfusionner,y,${C},${B},\n`)).toThrow(/déjà vidée/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B},\nfusionner,y,${C},${A},\n`)).toThrow(/vidée ailleurs/)
  })

  it('refuse : UUID invalide (fiche à vider ou gardée), id attendu invalide', () => {
    expect(() => parseLot(`${head}fusionner,x,${A},pas-un-uuid,\n`)).toThrow(/à vider invalide/)
    expect(() => parseLot(`${head}supprimer,x,,pas-un-uuid,\n`)).toThrow(/à vider invalide/)
    expect(() => parseLot(`${head}fusionner,x,pas-un-uuid,${B},\n`)).toThrow(/gardée invalide/)
    expect(() => parseLot(`${head}fusionner,x,,${B},\n`)).toThrow(/gardée invalide/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B},abc\n`)).toThrow(/id attendu invalide/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B},0\n`)).toThrow(/id attendu invalide/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B},012\n`)).toThrow(/id attendu invalide/)
  })

  it('refuse : « supprimer » avec une fiche gardée, fiche gardée = fiche vidée', () => {
    expect(() => parseLot(`${head}supprimer,x,${A},${B},\n`)).toThrow(/ne prend pas de fiche gardée/)
    expect(() => parseLot(`${head}fusionner,x,${A},${A},\n`)).toThrow(/gardée = fiche vidée/)
  })

  it('refuse : nombre de colonnes différent de 5 (une virgule en trop ne décale pas l’id attendu en silence)', () => {
    expect(() => parseLot(`${head}fusionner,x,${A},${B},,1163\n`)).toThrow(/6 colonnes au lieu de 5/)
    expect(() => parseLot(`${head}fusionner,x,${A},${B}\n`)).toThrow(/4 colonnes au lieu de 5/)
    expect(() => parseLot(`${head}supprimer,x,${C}\n`)).toThrow(/3 colonnes au lieu de 5/)
  })

  it('compare les UUID sans tenir compte de la casse (et les rend en minuscules)', () => {
    const Bmaj = B.toUpperCase()
    expect(() => parseLot(`${head}fusionner,x,${A},${B},\nfusionner,y,${C},${Bmaj},\n`)).toThrow(/déjà vidée/)
    expect(() => parseLot(`${head}fusionner,x,${A},${A.toUpperCase()},\n`)).toThrow(/gardée = fiche vidée/)
    expect(() => parseLot(`${head}fusionner,x,${A.toUpperCase()},${B},\nfusionner,y,${C},${A},\n`)).toThrow(/vidée ailleurs/)
    expect(parseLot(`${head}fusionner,x,${A.toUpperCase()},${Bmaj},\n`)).toEqual([
      { line: 2, action: 'fusionner', slug: 'x', keep: A, old: B, expectedId: null },
    ])
  })
})

describe('proveLot', () => {
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  const E = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const head = 'action,slug,garder,vider,id_attendu\n'
  const lines = parseLot(`action,slug,garder,vider,id_attendu\nfusionner,yann,${A},${B},1163\nfusionner,yann30000,${A},${C},\n`)
  const factsMap = new Map<string, FicheFacts>([
    [A, facts([['d1', 3000]])],
    [B, facts([], [['lola', 'd1', 1000]])],
    [C, facts([], [['claire', 'd1', 2000]])],
    [E, NO_FACTS],
  ])
  const idsMap = new Map([
    [A, ids('1163')],
    [B, ids('1163')],
    [C, ids('1163')],
  ])

  it('les lignes d’une même fiche gardée forment UN groupe, prouvé ensemble', () => {
    const d = proveLot({ lines, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set() })
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ ok: true, mypulsUserId: '1163' })
    expect(d[0]!.lines.map((l) => l.slug)).toEqual(['yann', 'yann30000'])
  })

  it('refus : fiche à vider reliée à un membre, fiche inconnue, suppression non corrompue', () => {
    expect(proveLot({ lines, facts: factsMap, ids: idsMap, linked: new Set([B]), corrupted: new Set() })[0]!.ok).toBe(false)
    expect(proveLot({ lines, facts: new Map(), ids: idsMap, linked: new Set(), corrupted: new Set() })[0]!.reasons.join(' ')).toContain(
      'inconnue',
    )
    const del = parseLot(`action,slug,garder,vider,id_attendu\nsupprimer,amed,,${C},\n`)
    expect(proveLot({ lines: del, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set() })[0]!.ok).toBe(false)
    // C est « corrompue » mais porte des chiffres : la suppression est refusée (voir le test dédié).
    expect(proveLot({ lines: del, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set([C]) })[0]!.ok).toBe(false)
  })

  it('suppression : acceptée pour une fiche corrompue SANS chiffres, refusée dès qu’elle en a', () => {
    const delE = parseLot(`${head}supprimer,amed,,${E},\n`)
    expect(proveLot({ lines: delE, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set([E]) })[0]).toMatchObject({
      ok: true,
      reasons: [],
    })
    const delC = parseLot(`${head}supprimer,amed,,${C},\n`)
    const d = proveLot({ lines: delC, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set([C]) })[0]!
    expect(d.ok).toBe(false)
    expect(d.reasons.join(' ')).toContain('la fiche a des chiffres : suppression refusée')
    // chiffres côté résumé seul, ou côté ventes seul : refusé dans les deux cas
    const onlyCd = new Map(factsMap).set(E, facts([['d1', 1]]))
    expect(proveLot({ lines: delE, facts: onlyCd, ids: idsMap, linked: new Set(), corrupted: new Set([E]) })[0]!.ok).toBe(false)
  })

  it('refus : fusionner une fiche à vider reliée à un membre, avec une raison explicite', () => {
    const d = proveLot({ lines, facts: factsMap, ids: idsMap, linked: new Set([B]), corrupted: new Set() })[0]!
    expect(d.ok).toBe(false)
    expect(d.reasons.join(' ')).toContain('reliée à un membre')
  })

  it('refus : supprimer une fiche corrompue (sans chiffres) reliée à un membre', () => {
    const del = parseLot(`${head}supprimer,amed,,${E},\n`)
    const d = proveLot({ lines: del, facts: factsMap, ids: idsMap, linked: new Set([E]), corrupted: new Set([E]) })[0]!
    expect(d.ok).toBe(false)
    expect(d.reasons.join(' ')).toContain('reliée à un membre')
  })

  it('refus : id_attendu contradictoires dans un même groupe', () => {
    const contradictoires = parseLot(
      `action,slug,garder,vider,id_attendu\nfusionner,yann,${A},${B},1163\nfusionner,yann30000,${A},${C},1164\n`,
    )
    const d = proveLot({ lines: contradictoires, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set() })[0]!
    expect(d.ok).toBe(false)
    expect(d.reasons.join(' ')).toContain('id_attendu contradictoires : 1163 / 1164')
  })

  it('même id_attendu répété sur deux lignes du groupe : accepté', () => {
    const memes = parseLot(
      `action,slug,garder,vider,id_attendu\nfusionner,yann,${A},${B},1163\nfusionner,yann30000,${A},${C},1163\n`,
    )
    expect(proveLot({ lines: memes, facts: factsMap, ids: idsMap, linked: new Set(), corrupted: new Set() })[0]!.ok).toBe(true)
  })

  it('pseudo-fiche « Indéterminé (…) » : jamais fusionnée, qu’elle soit gardée ou à vider', () => {
    const fiches = [fiche(A, 'Carla', { mypulsUserId: '5' }), fiche(B, 'Indéterminé (Carla)')]
    const pseudoIds = ficheIds({
      fiches,
      directory: dir([
        ['5', 'Carla'],
        ['5', 'Indéterminé (Carla)'],
      ]),
      norm,
    })
    const pseudoFacts = new Map<string, FicheFacts>([
      [A, facts([['d1', 3000]])],
      [B, facts([], [['claire', 'd1', 3000]])],
    ])
    for (const ligne of [`fusionner,x,${A},${B},`, `fusionner,x,${B},${A},`]) {
      const d = proveLot({
        lines: parseLot(`${head}${ligne}\n`),
        facts: pseudoFacts,
        ids: pseudoIds,
        linked: new Set(),
        corrupted: new Set(),
      })[0]!
      expect(d.ok).toBe(false)
      expect(d.reasons.join(' ')).toContain('id MyPuls non établi')
    }
  })
})

describe('identityIssueRow', () => {
  it('rend les colonnes de chatter_identity_issues avec la source', () => {
    expect(
      identityIssueRow(
        { issueKey: 'k', kind: 'doublon', mypulsUserId: '1', label: 'L', chatterId: 'a', otherChatterId: 'b', day: null, amount: null, detail: 'd' },
        'rattrapage',
      ),
    ).toEqual({
      issue_key: 'k',
      kind: 'doublon',
      mypuls_user_id: '1',
      label: 'L',
      chatter_id: 'a',
      other_chatter_id: 'b',
      day: null,
      amount: null,
      detail: 'd',
      source: 'rattrapage',
    })
  })
})
