import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chatterSummaryUrl, parseChatterSummary, parseMoneyTeamSales } from './money-team'
import {
  mypulsIdOf,
  pageTotalsFromCards,
  parseAssignableUsers,
  parseMoneyTeamDirectory,
  parseMoneyTeamPageTotals,
} from './money-team'

// Fixture = extrait d'une capture RÉELLE du fragment du 2026-09-06, comme pour `shifts.test.ts`.
// C'est le seul moyen de vérifier qu'on lit MyPuls et pas l'idée qu'on s'en fait — et c'est
// précisément ce qui a manqué le 2026-09-03, quand leur markup a changé sans qu'on le voie.
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const fixture = (name: string): string => readFileSync(resolve(dir, name), 'utf8')

describe('parseChatterSummary — le fragment « Résumé chatteur » (AJAX depuis le 2026-09-03)', () => {
  const rows = parseChatterSummary(fixture('chatter-summary.html'))

  it('lit une ligne par chatteur', () => {
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.name)).toEqual(['Alain', 'Kwasi', 'Seth', 'Ethane'])
  })

  it('lit les huit colonnes du nouveau tableau, taux de conversion ignoré', () => {
    expect(rows[0]).toEqual({
      name: 'Alain',
      reactiviteSec: 108,
      propose: 26,
      vendu: 8,
      caPpv: 1009.8,
      caTips: 513.42,
      ca: 1523.22,
    })
  })

  it('réactivité absente (« - ») → null, et non 0 : personne n’a répondu en zéro seconde', () => {
    expect(rows[3]?.reactiviteSec).toBeNull()
  })

  it('le CA total est bien la colonne 8, pas le PPV de la colonne 6', () => {
    // Le décalage de colonnes est le piège de ce changement : l'ancien tableau en avait NEUF,
    // présence comprise. Un mapping non corrigé lirait le taux de conversion comme un CA.
    const kwasi = rows[1]!
    expect(kwasi.ca).toBe(1452.99)
    expect(kwasi.caPpv + kwasi.caTips).toBeCloseTo(kwasi.ca, 2)
  })
})

describe('chatterSummaryUrl', () => {
  it('borne le jour, au format « Y-m-d H:i:s » attendu par l’endpoint', () => {
    expect(chatterSummaryUrl('2026-09-06')).toContain(
      '/creator/messaging-money-team/chatter-summary?start=2026-09-06%2000%3A00%3A00&end=2026-09-07%2000%3A00%3A00',
    )
  })
})

describe('parseMoneyTeamSales — les ventes, au milieu d’une table qui leur ressemble', () => {
  // Fixture = les DEUX tables de la page du 2026-09-06, réduites à deux lignes chacune : le
  // classement (`ranking-table`, ajouté par MyPuls) puis les ventes. Leur cohabitation EST le
  // piège : les deux portent un `th` « Montant net ».
  const tx = parseMoneyTeamSales(fixture('money-team-page.html'))

  it('lit les ventes, et non le classement qui les précède', () => {
    expect(tx).toHaveLength(2)
    // Un nom de créatrice, pas un rang : « 1 » signerait la table de classement.
    for (const t of tx) expect(t.creator).not.toMatch(/^\d+$/)
  })

  it('rend créateur, chatteur, montant et type', () => {
    expect(tx[0]?.creator).toBe('Lena_dv')
    expect(tx[0]?.amount).toBeGreaterThan(0)
    expect(tx[0]?.type).toBeTruthy()
  })
})
describe('identité MyPuls — l’id de chaque vente et l’annuaire de la page', () => {
  // Spec docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 1.
  const html = fixture('money-team-identity.html')
  const tx = parseMoneyTeamSales(html)
  const dir = parseMoneyTeamDirectory(html)

  it('lit l’id du compte sur chaque vente — un même id sous deux libellés', () => {
    expect(tx.map((t) => [t.chatter, t.mypulsUserId])).toEqual([
      ['Lionel', '1802'],
      ['lioneldiv', '1802'],
      ['Indéterminé (Sarahcbr)', null],
      ['Serge', '10504'],
    ])
  })

  it('ne lit jamais le classement : « Aucune vente sur la période » n’est pas une vente', () => {
    expect(tx).toHaveLength(4)
    expect(tx.some((t) => t.chatter.includes('Aucune vente'))).toBe(false)
  })

  it('l’annuaire prend le select sans « all » ni « -1 », homonymes conservés', () => {
    expect(dir.filter((d) => d.source === 'select').map((d) => [d.mypulsUserId, d.label])).toEqual([
      ['243', 'Yann (accès révoqué)'],
      ['1163', 'yann (accès révoqué)'],
      ['1802', 'Lionel'],
      ['9332', 'Serge'],
      ['10504', 'Serge'],
    ])
  })

  it('l’annuaire prend le JSON des équipes (clés numériques : ordre croissant des ids de modèle)', () => {
    expect(dir.filter((d) => d.source === 'assignable').map((d) => [d.mypulsUserId, d.label])).toEqual([
      ['1802', 'lioneldiv'], // modèle 288
      ['1163', 'yann'], // modèle 328
      ['1802', 'Lionel'], // modèle 1311
      ['9332', 'Serge'],
      ['10504', 'Serge'],
    ])
  })

  it('parseAssignableUsers : sans JSON ou JSON illisible → [] ; une paire vue deux fois → une', () => {
    expect(parseAssignableUsers('const autre = 1;')).toEqual([])
    expect(parseAssignableUsers('const assignableUsersByCreator = {"1":[{"id":1,};')).toEqual([])
    const s = 'const assignableUsersByCreator = {"1":[{"id":5,"label":"Ana"}],"2":[{"id":5,"label":"Ana"}]};'
    expect(parseAssignableUsers(s)).toEqual([{ mypulsUserId: '5', label: 'Ana', source: 'assignable' }])
  })

  it('mypulsIdOf : entier > 0 seulement', () => {
    expect(mypulsIdOf(' 1802 ')).toBe('1802')
    for (const v of ['', 'all', '-1', '0', '12a', null, undefined]) expect(mypulsIdOf(v)).toBeNull()
  })

  it('la fixture historique porte aussi les ids (capture réelle du 06/09)', () => {
    expect(parseMoneyTeamSales(fixture('money-team-page.html')).map((t) => t.mypulsUserId)).toEqual([
      '2155',
      '1174',
    ])
  })
})

describe('totaux de la page — calculés par MyPuls, indépendants des lignes lues', () => {
  it('lit la carte « Ventes » et la carte « Montant net · EUR », égales aux lignes', () => {
    const html = fixture('money-team-identity.html')
    const totals = parseMoneyTeamPageTotals(html)
    expect(totals).toEqual({ salesCount: 4, net: [{ currency: 'EUR', amount: 267.68 }] })
    const lines = parseMoneyTeamSales(html)
    expect(lines.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(267.68, 2)
    expect(lines).toHaveLength(totals.salesCount!)
  })

  it('page sans cartes KPI → totaux absents (null / [])', () => {
    expect(parseMoneyTeamPageTotals(fixture('money-team-page.html'))).toEqual({ salesCount: null, net: [] })
  })

  it('une carte avec deux h3 : les textes sont concaténés, comme côté Worker (comportement défini)', () => {
    const card = (h3: string) =>
      `<div class="kpi-card"><h6>Montant net · EUR</h6>${h3}</div><div class="kpi-card"><h6>Ventes</h6><h3>7</h3></div>`
    expect(parseMoneyTeamPageTotals(card('<h3>12</h3><h3>34,50</h3>'))).toEqual({
      salesCount: 7,
      net: [{ currency: 'EUR', amount: 1234.5 }],
    })
    // Même résultat qu'avec la valeur déjà concaténée.
    expect(parseMoneyTeamPageTotals(card('<h3>1234,50</h3>'))).toEqual(parseMoneyTeamPageTotals(card('<h3>12</h3><h3>34,50</h3>')))
  })

  it('une carte au bon libellé sans chiffre lisible est absente, pas égale à 0', () => {
    expect(pageTotalsFromCards([{ label: 'Ventes', value: ' — ' }])).toEqual({ salesCount: null, net: [] })
    expect(pageTotalsFromCards([{ label: 'Montant net · EUR', value: 'n/d' }])).toEqual({ salesCount: null, net: [] })
    expect(pageTotalsFromCards([{ label: 'Ventes', value: '0' }]).salesCount).toBe(0)
  })

  it('une carte par devise ; l’ancien libellé « Ventes attribuées » n’est pas la carte « Ventes »', () => {
    expect(
      pageTotalsFromCards([
        { label: ' Ventes attribuées ', value: '413' },
        { label: 'Montant net · EUR', value: '13 047,86 EUR' },
        { label: 'Montant net · USD', value: '1 234,56 USD' },
      ]),
    ).toEqual({
      salesCount: null,
      net: [
        { currency: 'EUR', amount: 13047.86 },
        { currency: 'USD', amount: 1234.56 },
      ],
    })
  })
})
