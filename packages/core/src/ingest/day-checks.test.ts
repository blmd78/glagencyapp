import { describe, expect, it } from 'vitest'
import { resolveDayIdentity, type DayIdentity, type SaleLine, type SummaryLine } from './chatter-identity'
import { dayChecks, expectedDayTotals, type DayCheck } from './day-checks'
import { norm, state, type F } from './identity.fixtures'

const byCode = (checks: DayCheck[]) => Object.fromEntries(checks.map((c) => [c.code, c]))

/** Résout la journée puis la contrôle, comme le fera l'ingestion : tout ce que les tests lisent. */
function day(o: {
  fiches: F[]
  summary: SummaryLine[]
  sales: SaleLine[]
  directory?: [string, string][]
  page?: { salesCount: number | null; net: number | null }
  apiCaCents?: number | null
}) {
  let n = 0
  const st = state(o.fiches)
  const identity = resolveDayIdentity({
    day: '2026-09-06',
    summary: o.summary,
    sales: o.sales,
    directory: (o.directory ?? []).map(([mypulsUserId, label]) => ({ mypulsUserId, label })),
    state: st,
    norm,
    newId: () => `new-${++n}`,
  })
  const total = o.sales.reduce((s, t) => s + t.amount, 0)
  const expected = expectedDayTotals({
    summary: o.summary.map((l) => ({ caPpv: l.ca, caTips: 0 })),
    sales: o.sales,
    page: o.page ?? { salesCount: o.sales.length, net: total },
  })
  const checks = dayChecks({
    summary: o.summary,
    sales: o.sales,
    identity,
    mypulsIdOf: (id) => st.mypulsIdByChatter.get(id) ?? null,
    expected,
    apiCaCents: o.apiCaCents,
  })
  return { identity, expected, checks }
}

const check = (o: Parameters<typeof day>[0]) => byCode(day(o).checks)

/** Identité forgée à la main : pour les branches que le vrai résolveur ne produit pas (ou pas seules). */
function forged(o: {
  summary?: SummaryLine[]
  sales?: SaleLine[]
  identity?: Partial<DayIdentity>
  mypulsIdOf?: (chatterId: string) => string | null
}) {
  const summary = o.summary ?? []
  const sales = o.sales ?? []
  return byCode(
    dayChecks({
      summary,
      sales,
      identity: {
        summaryChatter: [],
        summaryIds: [],
        saleChatter: [],
        newChatters: [],
        newAliases: [],
        links: [],
        issues: [],
        technical: [],
        noIds: false,
        ...o.identity,
      },
      mypulsIdOf: o.mypulsIdOf ?? (() => null),
      expected: expectedDayTotals({
        summary: summary.map((l) => ({ caPpv: l.ca, caTips: 0 })),
        sales,
        page: { salesCount: sales.length, net: sales.reduce((s, t) => s + t.amount, 0) },
      }),
    }),
  )
}

const lionel = { id: 'A', name: 'Lionel', mypulsId: '1802' }

describe('expectedDayTotals', () => {
  it('additionne en centimes (0,10 + 0,20 = 30 centimes, pas 30,000000000000004)', () => {
    expect(
      expectedDayTotals({
        summary: [{ caPpv: 0.1, caTips: 0.2 }],
        sales: [{ amount: 0.1 }, { amount: 0.2 }],
        page: { salesCount: 2, net: 0.3 },
      }),
    ).toEqual({ summary_cents: 30, sales_cents: 30, sales_count: 2, page_net_cents: 30, page_sales_count: 2 })
  })

  it('arrondit chaque ligne au centime avant de sommer : des entiers, jamais de dérive flottante', () => {
    const e = expectedDayTotals({
      summary: [
        { caPpv: 70.79, caTips: 0 },
        { caPpv: 0.07, caTips: 0.01 },
      ],
      sales: [{ amount: 0.1 }, { amount: 0.1 }, { amount: 0.1 }, { amount: 1234.56 }],
      page: { salesCount: 4, net: 1234.86 },
    })
    expect(e).toEqual({ summary_cents: 7087, sales_cents: 123486, sales_count: 4, page_net_cents: 123486, page_sales_count: 4 })
    expect(Object.values(e).every((v) => Number.isInteger(v))).toBe(true)
  })

  it('un total de page absent reste null (jamais 0) ; une valeur illisible (NaN) aussi', () => {
    const base = { summary: [], sales: [{ amount: 1 }] }
    expect(expectedDayTotals({ ...base, page: { salesCount: null, net: null } })).toMatchObject({
      page_net_cents: null,
      page_sales_count: null,
    })
    expect(expectedDayTotals({ ...base, page: { salesCount: Number.NaN, net: Number.NaN } })).toMatchObject({
      page_net_cents: null,
      page_sales_count: null,
    })
  })

  it('compte TOUTES les lignes lues, y compris celles qui ne seront pas écrites : c’est ce qui fait échouer b1/b2 en base', () => {
    // Deux comptes « Serge » au même montant : la ligne de résumé est mise de côté (D3), donc jamais écrite.
    const summary = [{ label: 'Serge', ca: 10 }]
    const { identity, expected } = day({
      fiches: [],
      summary,
      sales: [
        { label: 'Serge', mypulsUserId: '9332', amount: 10 },
        { label: 'Serge', mypulsUserId: '10504', amount: 10 },
      ],
    })
    expect(identity.summaryChatter).toEqual([null])
    // Ce que la base contiendra : les lignes de résumé rattachées à une fiche (null = non écrite).
    const written = summary.reduce((s, l, i) => s + (identity.summaryChatter[i] ? Math.round(l.ca * 100) : 0), 0)
    expect(written).toBe(0)
    expect(expected.summary_cents).toBe(1000) // ≠ 0 en base → b_resume_ecrit échoue, le jour est « à vérifier »
    // Idem côté ventes : une vente d'un modèle inconnu du CRM est lue (donc attendue) mais pas écrite.
    expect(expected.sales_cents).toBe(2000)
    expect(expected.sales_count).toBe(2)
  })
})

describe('dayChecks', () => {
  it('jour juste : a, b_total_page et c au vert', () => {
    const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] })
    expect([c.a_resume_ventes?.ok, c.b_total_page?.ok, c.c_fiche_compte?.ok]).toEqual([true, true, true])
  })

  it('ne rend que les trois contrôles du client : b_resume_ecrit / b_ventes_ecrites sont ajoutés par la base', () => {
    const { checks } = day({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] })
    expect(checks.map((c) => c.code)).toEqual(['a_resume_ventes', 'b_total_page', 'c_fiche_compte'])
  })

  it('a : résumé ≠ ventes d’un compte → échec, avec le compte en détail', () => {
    const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 10 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12.5 }] })
    expect(c.a_resume_ventes?.ok).toBe(false)
    expect(c.a_resume_ventes?.detail).toContain('1802')
  })

  it('a : un écart d’un centime suffit', () => {
    const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 70.79 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 70.78 }] })
    expect(c.a_resume_ventes?.ok).toBe(false)
  })

  it('b_total_page : total de page introuvable → échec ; total différent → échec', () => {
    const base = { fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] }
    expect(check({ ...base, page: { salesCount: null, net: null } }).b_total_page?.ok).toBe(false)
    expect(check({ ...base, page: { salesCount: 1, net: 13 } }).b_total_page?.ok).toBe(false)
    expect(check({ ...base, page: { salesCount: 2, net: 12 } }).b_total_page?.ok).toBe(false)
  })

  it('b_total_page : un total de page absent (une carte, l’autre, ou les deux) échoue avec « total de page introuvable », jamais ok', () => {
    const base = { fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] }
    for (const page of [
      { salesCount: null, net: null },
      { salesCount: null, net: 12 },
      { salesCount: 1, net: null },
    ]) {
      const b = check({ ...base, page }).b_total_page
      expect(b?.ok).toBe(false)
      expect(b?.detail).toContain('total de page introuvable')
    }
    // On dit quelle carte manque.
    expect(check({ ...base, page: { salesCount: null, net: 12 } }).b_total_page?.detail).toContain('« Ventes »')
    expect(check({ ...base, page: { salesCount: 1, net: null } }).b_total_page?.detail).toContain('« Montant net »')
  })

  it('b_total_page : 0 vente lue + page null/null → échec (jamais « 0 = 0 » : garde contre un futur `net ?? 0`)', () => {
    const b = check({ fiches: [lionel], summary: [], sales: [], page: { salesCount: null, net: null } }).b_total_page
    expect(b?.ok).toBe(false)
    expect(b?.detail).toContain('total de page introuvable')
  })

  it('b_total_page : jour sans vente et page à 0 → ok ; page à 0 alors qu’on lit une vente → échec (0 n’est pas « absent »)', () => {
    const empty = { fiches: [lionel], summary: [], sales: [] }
    expect(check({ ...empty, page: { salesCount: 0, net: 0 } }).b_total_page?.ok).toBe(true)
    const one = { fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] }
    expect(check({ ...one, page: { salesCount: 0, net: 0 } }).b_total_page?.ok).toBe(false)
  })

  it('b_total_page : au centime près — 12,00 lus contre 12,01 affichés → échec', () => {
    const base = { fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] }
    expect(check({ ...base, page: { salesCount: 1, net: 12.01 } }).b_total_page?.ok).toBe(false)
    expect(check({ ...base, page: { salesCount: 1, net: 12 } }).b_total_page?.ok).toBe(true)
  })

  it('c : deux fiches reliées pour un même id → lignes vers des fiches sans id, id sur deux fiches', () => {
    const c = check({
      fiches: [
        { id: 'L1', name: 'Jordan', linked: true },
        { id: 'L2', name: 'Jordan manager', linked: true },
      ],
      summary: [{ label: 'JORDAN', ca: 5 }],
      sales: [{ label: 'Jordan manager', mypulsUserId: '296', amount: 5 }],
      directory: [['296', 'JORDAN']],
    })
    expect(c.c_fiche_compte?.ok).toBe(false)
    expect(c.c_fiche_compte?.detail).toContain('sans id')
    expect(c.c_fiche_compte?.detail).toContain('plusieurs fiches')
  })

  it('jour sans aucun id : a et c en échec (rien n’est vérifiable)', () => {
    const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: null, amount: 12 }] })
    expect([c.a_resume_ventes?.ok, c.c_fiche_compte?.ok]).toEqual([false, false])
  })

  it('c : un id posé ce jour (lien ou fiche créée avec son id) compte comme porté par la fiche', () => {
    // Lien : la fiche « Lionel » n'avait pas d'id, la nuit le lui pose.
    const linked = day({ fiches: [{ id: 'A', name: 'Lionel' }], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }] })
    expect(linked.identity.links).toEqual([{ chatterId: 'A', mypulsUserId: '1802' }])
    expect(byCode(linked.checks).c_fiche_compte?.ok).toBe(true)
    // Fiche créée : elle naît avec son id.
    const created = day({ fiches: [], summary: [{ label: 'Nouveau', ca: 3 }], sales: [{ label: 'Nouveau', mypulsUserId: '777', amount: 3 }] })
    expect(created.identity.newChatters).toHaveLength(1)
    expect(byCode(created.checks).c_fiche_compte?.ok).toBe(true)
  })

  it('c : une ligne d’id X sur une fiche qui porte un AUTRE id → échec « vers la fiche d’un autre id » (identité forgée à la main)', () => {
    const checks = forged({
      sales: [{ label: 'Lionel', mypulsUserId: '999', amount: 1 }],
      identity: { saleChatter: ['A'] },
      mypulsIdOf: (f) => (f === 'A' ? '1802' : null),
    })
    expect(checks.c_fiche_compte?.ok).toBe(false)
    expect(checks.c_fiche_compte?.detail).toContain('autre id')
    expect(checks.c_fiche_compte?.detail).toContain('1802')
  })

  describe('c : fermé par défaut — une ligne d’id sans fiche, ou une résolution incomplète, échoue', () => {
    it('vente avec un id mais sans fiche (membres multiples, libellé sans fiche) → « id sans fiche »', () => {
      const checks = forged({
        sales: [{ label: 'Jordy', mypulsUserId: '296', amount: 2 }],
        identity: { saleChatter: [null] },
      })
      expect(checks.c_fiche_compte?.ok).toBe(false)
      expect(checks.c_fiche_compte?.detail).toContain('id sans fiche')
      expect(checks.c_fiche_compte?.detail).toContain('Jordy')
      expect(checks.c_fiche_compte?.detail).toContain('296')
    })

    it('ligne de résumé avec un id mais sans fiche → « id sans fiche »', () => {
      const checks = forged({
        summary: [{ label: 'Jordan', ca: 7 }],
        identity: { summaryIds: ['296'], summaryChatter: [null] },
      })
      expect(checks.c_fiche_compte?.ok).toBe(false)
      expect(checks.c_fiche_compte?.detail).toContain('id sans fiche : « Jordan » (296)')
    })

    it('le vrai résolveur, cas « membres multiples » : la ligne « Jordy » (id 296, sans fiche) est nommée', () => {
      const { identity, checks } = day({
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
      expect(identity.saleChatter).toEqual(['L2', null])
      expect(byCode(checks).c_fiche_compte?.detail).toContain('id sans fiche : « Jordy » (296)')
    })

    it('saleChatter plus court que les ventes → « résolution incomplète »', () => {
      const checks = forged({
        sales: [
          { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
          { label: 'Lionel', mypulsUserId: '1802', amount: 2 },
        ],
        identity: { saleChatter: ['A'] },
        mypulsIdOf: () => '1802',
      })
      expect(checks.c_fiche_compte?.ok).toBe(false)
      expect(checks.c_fiche_compte?.detail).toContain('résolution incomplète')
    })

    it('summaryChatter (ou summaryIds) plus court que le résumé → « résolution incomplète »', () => {
      const short = forged({ summary: [{ label: 'Lionel', ca: 1 }], identity: { summaryIds: ['1802'], summaryChatter: [] } })
      expect(short.c_fiche_compte?.ok).toBe(false)
      expect(short.c_fiche_compte?.detail).toContain('résolution incomplète')
      const noIdsList = forged({ summary: [{ label: 'Lionel', ca: 1 }], identity: { summaryIds: [], summaryChatter: ['A'] } })
      expect(noIdsList.c_fiche_compte?.ok).toBe(false)
      expect(noIdsList.c_fiche_compte?.detail).toContain('résolution incomplète')
    })

    it('saleChatter plus long que les ventes → « résolution incomplète » aussi (désalignement)', () => {
      const checks = forged({ sales: [], identity: { saleChatter: ['A'] } })
      expect(checks.c_fiche_compte?.ok).toBe(false)
      expect(checks.c_fiche_compte?.detail).toContain('résolution incomplète')
    })

    it('listes de la bonne longueur, tout rattaché à une fiche qui porte l’id → au vert (pas de faux positif)', () => {
      const checks = forged({
        summary: [{ label: 'Lionel', ca: 1 }],
        sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 1 }],
        identity: { summaryIds: ['1802'], summaryChatter: ['A'], saleChatter: ['A'] },
        mypulsIdOf: () => '1802',
      })
      expect(checks.c_fiche_compte?.ok).toBe(true)
    })
  })

  describe('a : une vente sans id (hors « Indéterminé ») un jour où les ids sont lus fait échouer', () => {
    it('« Inconnu » 3 € sans id parmi des ventes identifiées → a échoue, « vente sans id : Inconnu 3,00 € »', () => {
      const { identity, checks } = day({
        fiches: [lionel],
        summary: [{ label: 'Lionel', ca: 12 }],
        sales: [
          { label: 'Lionel', mypulsUserId: '1802', amount: 12 },
          { label: 'Inconnu', mypulsUserId: null, amount: 3 },
        ],
      })
      expect(identity.noIds).toBe(false)
      const c = byCode(checks)
      expect(c.a_resume_ventes?.ok).toBe(false)
      expect(c.a_resume_ventes?.detail).toContain('vente sans id : Inconnu 3,00 €')
      // Les totaux de page, eux, sont justes : seul le contrôle par compte voit que cette vente ne tombe sur aucun compte.
      expect(c.b_total_page?.ok).toBe(true)
    })

    it('plusieurs ventes sans id, libellé vide compris : toutes listées avec leur montant', () => {
      const c = check({
        fiches: [lionel],
        summary: [{ label: 'Lionel', ca: 12 }],
        sales: [
          { label: 'Lionel', mypulsUserId: '1802', amount: 12 },
          { label: 'Inconnu', mypulsUserId: null, amount: 3 },
          { label: '', mypulsUserId: null, amount: 0.5 },
        ],
      })
      expect(c.a_resume_ventes?.ok).toBe(false)
      expect(c.a_resume_ventes?.detail).toContain('Inconnu 3,00 €')
      expect(c.a_resume_ventes?.detail).toContain('(sans libellé) 0,50 €')
    })

    it('une vente « Indéterminé (…) » sans id est normale : a reste au vert', () => {
      const c = check({
        fiches: [{ id: 'I', name: 'Indéterminé (Sarahcbr)' }, lionel],
        summary: [{ label: 'Lionel', ca: 1 }],
        sales: [
          { label: 'Indéterminé (Sarahcbr)', mypulsUserId: null, amount: 38.32 },
          { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
        ],
      })
      expect(c.a_resume_ventes?.ok).toBe(true)
    })

    it('jour sans aucun id : le détail reste « aucun id », pas une liste de ventes sans id', () => {
      const c = check({ fiches: [lionel], summary: [{ label: 'Lionel', ca: 12 }], sales: [{ label: 'Lionel', mypulsUserId: null, amount: 12 }] })
      expect(c.a_resume_ventes?.detail).toContain('Aucun id MyPuls lu')
      expect(c.a_resume_ventes?.detail).not.toContain('vente sans id')
    })
  })

  describe('a : une ligne de résumé avec un CA et aucune vente derrière fait échouer', () => {
    const lionelSales: SaleLine[] = [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }]

    it('résumé [Lionel 12, Ghost 50] / ventes [Lionel 12] : 50 € de résumé sans aucun compte → a échoue, libellé et montant en détail', () => {
      const { checks } = day({
        fiches: [lionel],
        summary: [
          { label: 'Lionel', ca: 12 },
          { label: 'Ghost', ca: 50 },
        ],
        sales: lionelSales,
      })
      const c = byCode(checks)
      expect(c.a_resume_ventes?.ok).toBe(false)
      expect(c.a_resume_ventes?.detail).toContain('résumé sans ventes : Ghost 50,00 €')
      // Les ventes, elles, sont justes : seul a (le résumé) le voit.
      expect(c.b_total_page?.ok).toBe(true)
    })

    it('plusieurs lignes orphelines : toutes listées, avec leur montant ; un montant négatif compte aussi', () => {
      const c = check({
        fiches: [lionel],
        summary: [
          { label: 'Lionel', ca: 12 },
          { label: 'Ghost', ca: 50 },
          { label: 'Fantôme', ca: -3.5 },
        ],
        sales: lionelSales,
      })
      expect(c.a_resume_ventes?.ok).toBe(false)
      expect(c.a_resume_ventes?.detail).toContain('Ghost 50,00 €')
      expect(c.a_resume_ventes?.detail).toContain('Fantôme -3,50 €')
    })

    it('cas jumeau : le libellé est connu de l’annuaire (id 555) mais l’id n’a aucune vente → a échoue aussi (écart par id)', () => {
      const c = check({
        fiches: [lionel],
        summary: [
          { label: 'Lionel', ca: 12 },
          { label: 'Ghost', ca: 50 },
        ],
        sales: lionelSales,
        directory: [['555', 'Ghost']],
      })
      expect(c.a_resume_ventes?.ok).toBe(false)
      expect(c.a_resume_ventes?.detail).toContain('555')
    })

    it('a l’écart par id ET l’orpheline dans le même détail, sans que l’un masque l’autre', () => {
      const c = check({
        fiches: [lionel],
        summary: [
          { label: 'Lionel', ca: 10 },
          { label: 'Ghost', ca: 50 },
        ],
        sales: lionelSales,
      })
      expect(c.a_resume_ventes?.detail).toContain('1802')
      expect(c.a_resume_ventes?.detail).toContain('Ghost 50,00 €')
    })

    it('toutes les lignes de résumé tombent sur un compte, ou valent 0 €, ou sont « Indéterminé » → a au vert', () => {
      const c = check({
        fiches: [lionel, { id: 'J', name: 'Jordy', mypulsId: '296' }],
        summary: [
          { label: 'Lionel', ca: 12 },
          { label: 'Jordy', ca: 3.3 },
          { label: 'inactif@exemple.fr', ca: 0 }, // comptes muets : 0 €, aucune vente, aucun id (rien de perdu)
          { label: '', ca: 0 },
          { label: 'Indéterminé (Carla)', ca: 5 }, // pseudo-fiche : jamais d'id, hors du contrôle par compte
        ],
        sales: [
          { label: 'Lionel', mypulsUserId: '1802', amount: 12 },
          { label: 'Jordy', mypulsUserId: '296', amount: 3.3 },
          { label: 'Indéterminé (Carla)', mypulsUserId: null, amount: 5 },
        ],
      })
      expect(c.a_resume_ventes?.ok).toBe(true)
    })

    it('une ligne mise de côté (libellé à deux comptes non départagés) n’est PAS dite « sans ventes » : b1 (base) la porte, a reste au vert', () => {
      const { identity, checks } = day({
        fiches: [],
        summary: [{ label: 'Serge', ca: 10 }],
        sales: [
          { label: 'Serge', mypulsUserId: '9332', amount: 10 },
          { label: 'Serge', mypulsUserId: '10504', amount: 10 },
        ],
      })
      expect(identity.summaryChatter).toEqual([null])
      expect(byCode(checks).a_resume_ventes?.ok).toBe(true)
    })

    it('jour sans aucun id : le détail reste « aucun id », pas une liste d’orphelines', () => {
      const c = check({
        fiches: [lionel],
        summary: [{ label: 'Lionel', ca: 12 }],
        sales: [{ label: 'Lionel', mypulsUserId: null, amount: 12 }],
      })
      expect(c.a_resume_ventes?.detail).toContain('Aucun id MyPuls lu')
      expect(c.a_resume_ventes?.detail).not.toContain('sans ventes')
    })
  })

  describe('« Indéterminé (…) » : un id lu sur une telle vente est ignoré, comme par le résolveur', () => {
    it('avec sa pseudo-fiche en base (sans id) : ni c ni a n’échouent', () => {
      const { identity, checks } = day({
        fiches: [{ id: 'I', name: 'Indéterminé (Carla)' }, lionel],
        summary: [
          { label: 'Indéterminé (Carla)', ca: 5 },
          { label: 'Lionel', ca: 1 },
        ],
        sales: [
          { label: 'Indéterminé (Carla)', mypulsUserId: '4242', amount: 5 },
          { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
        ],
      })
      expect(identity.saleChatter).toEqual(['I', 'A']) // la pseudo-fiche reçoit la vente, sans id
      expect(identity.technical.join(' ')).toContain('Indéterminé (Carla)') // l'alerte technique reste côté Sentry
      const c = byCode(checks)
      expect([c.a_resume_ventes?.ok, c.b_total_page?.ok, c.c_fiche_compte?.ok]).toEqual([true, true, true])
    })

    it('sans pseudo-fiche en base : la fiche créée n’a pas d’id et c reste au vert', () => {
      const { identity, checks } = day({
        fiches: [lionel],
        summary: [{ label: 'Lionel', ca: 1 }],
        sales: [
          { label: 'Indéterminé (Carla)', mypulsUserId: '4242', amount: 5 },
          { label: 'Lionel', mypulsUserId: '1802', amount: 1 },
        ],
      })
      expect(identity.newChatters).toEqual([{ id: 'new-1', displayName: 'Indéterminé (Carla)', mypulsUserId: null }])
      const c = byCode(checks)
      expect([c.a_resume_ventes?.ok, c.c_fiche_compte?.ok]).toEqual([true, true])
    })

    it('ça n’empêche pas un vrai défaut d’être vu : un id sur plusieurs fiches reste en échec', () => {
      const c = check({
        fiches: [
          { id: 'I', name: 'Indéterminé (Carla)' },
          { id: 'L1', name: 'Jordan', linked: true },
          { id: 'L2', name: 'Jordan manager', linked: true },
        ],
        summary: [{ label: 'JORDAN', ca: 5 }],
        sales: [
          { label: 'Indéterminé (Carla)', mypulsUserId: '4242', amount: 2 },
          { label: 'Jordan manager', mypulsUserId: '296', amount: 5 },
        ],
        directory: [['296', 'JORDAN']],
      })
      expect(c.c_fiche_compte?.ok).toBe(false)
      expect(c.c_fiche_compte?.detail).not.toContain('4242')
    })
  })

  describe('jour « à vérifier » : jamais « ok » quand une ligne lue n’est pas écrite', () => {
    it('résumé mis de côté (D3) : a et c restent au vert, par construction ; b_resume_ecrit (base) échoue car summary_cents compte la ligne', () => {
      const { identity, expected, checks } = day({
        fiches: [],
        summary: [{ label: 'Serge', ca: 10 }],
        sales: [
          { label: 'Serge', mypulsUserId: '9332', amount: 10 },
          { label: 'Serge', mypulsUserId: '10504', amount: 10 },
        ],
      })
      expect(identity.issues.map((i) => i.kind)).toContain('resume_mis_de_cote')
      const c = byCode(checks)
      // a ne compare que des ids : les comptes mis de côté sont exclus de l'invariant (le montant est signalé à part).
      expect([c.a_resume_ventes?.ok, c.b_total_page?.ok, c.c_fiche_compte?.ok]).toEqual([true, true, true])
      // Le contrôle qui l'attrape : en base, chatter_daily ne contient pas les 10 € mis de côté.
      expect(expected.summary_cents).toBe(1000)
    })

    it('résumé mis de côté à 0 € : rien de perdu, summary_cents vaut 0, pas d’anomalie', () => {
      const { identity, expected } = day({
        fiches: [],
        summary: [{ label: 'Serge', ca: 0 }],
        sales: [],
        directory: [['9332', 'Serge'], ['10504', 'Serge']],
        page: { salesCount: 0, net: 0 },
      })
      expect(identity.issues).toEqual([])
      expect(expected.summary_cents).toBe(0)
    })

    it('vente d’un modèle inconnu du CRM : lue donc attendue — b_total_page (page = lignes lues) reste vert, b_ventes_ecrites (base) l’attrape', () => {
      // `SaleLine` ne porte pas de modèle : dayChecks ne peut pas voir l'écart, la base si (sales_cents
      // compte TOUTES les ventes lues, écartées comprises).
      const { expected, checks } = day({
        fiches: [lionel],
        summary: [{ label: 'Lionel', ca: 12 }],
        sales: [
          { label: 'Lionel', mypulsUserId: '1802', amount: 5 },
          { label: 'Lionel', mypulsUserId: '1802', amount: 7 }, // supposons celle-ci d'un modèle inconnu
        ],
      })
      expect(byCode(checks).b_total_page?.ok).toBe(true)
      expect(expected.sales_cents).toBe(1200)
      expect(expected.sales_count).toBe(2)
    })
  })
})

describe('dayChecks — jour vide servi par MyPuls, contre le total indépendant de l’API', () => {
  // Page servie vide (0 vente, 0 ligne de résumé, cartes à 0) : sans total indépendant, tout passe
  // (0 = 0 partout, et b1/b2 en base aussi au premier passage). Le CA PPV + pourboires du jour lu par
  // l'API (/team/money, déjà écrit dans creator_daily) est ce total indépendant.
  const empty = { fiches: [lionel], summary: [], sales: [], page: { salesCount: 0, net: 0 } }
  const one = {
    fiches: [lionel],
    summary: [{ label: 'Lionel', ca: 12 }],
    sales: [{ label: 'Lionel', mypulsUserId: '1802', amount: 12 }],
  }

  it('0 vente lue, cartes à 0, mais l’API annonce 50 € → b_total_page échoue, montant de l’API en détail', () => {
    const b = check({ ...empty, apiCaCents: 5000 }).b_total_page
    expect(b?.ok).toBe(false)
    expect(b?.detail).toContain("0 vente lue alors que l'API annonce 50,00 €")
  })

  it('0 vente lue et API à 0 → jour réellement vide : b_total_page reste au vert', () => {
    expect(check({ ...empty, apiCaCents: 0 }).b_total_page?.ok).toBe(true)
  })

  it('sans total API (appelant qui ne le fournit pas) → comportement d’avant : au vert', () => {
    expect(check(empty).b_total_page?.ok).toBe(true)
    expect(check({ ...empty, apiCaCents: null }).b_total_page?.ok).toBe(true)
  })

  it('des ventes lues = la page, API > 0 → la garde ne joue pas (pas de faux positif)', () => {
    expect(check({ ...one, page: { salesCount: 1, net: 12 }, apiCaCents: 1200 }).b_total_page?.ok).toBe(true)
  })

  it('carte « Ventes » à 0 alors qu’on lit une vente et que l’API annonce du CA → échec, la page à 0 est nommée', () => {
    const b = check({ ...one, page: { salesCount: 0, net: 0 }, apiCaCents: 1200 }).b_total_page
    expect(b?.ok).toBe(false)
    expect(b?.detail).toContain("page MyPuls à 0 vente alors que l'API annonce 12,00 €")
  })
})
