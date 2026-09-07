import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chatterSummaryUrl, parseChatterSummary } from './money-team'

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
