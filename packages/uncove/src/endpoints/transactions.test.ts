import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTxVolumes, transactionsVolumesUrl } from './transactions'

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const raw = JSON.parse(readFileSync(resolve(dir, 'transactions-volumes.json'), 'utf8'))

describe('parseTxVolumes — CA journalier (montant par jour)', () => {
  it('une ligne par jour, triée, en ISO (fixture Alice = 0 partout)', () => {
    const rows = parseTxVolumes(raw)
    expect(rows).toHaveLength(7)
    expect(rows[0]).toEqual({ day: '2026-09-01', revenue: 0 })
    expect(rows.every((r) => r.revenue === 0)).toBe(true)
  })

  it('préserve les montants non nuls et trie par date', () => {
    const rows = parseTxVolumes({ '05/09/2026': 12.5, '04/09/2026': 3 })
    expect(rows).toEqual([
      { day: '2026-09-04', revenue: 3 },
      { day: '2026-09-05', revenue: 12.5 },
    ])
  })
})

describe('transactionsVolumesUrl', () => {
  it('cible /api/v2.0/transactions/volumes avec currency obligatoire', () => {
    const url = transactionsVolumesUrl('2026-08-31T22:00:00.000Z', '2026-09-07T21:59:59.999Z', 'eur')
    expect(url).toContain('/api/v2.0/transactions/volumes?')
    expect(url).toContain('currency=eur')
    expect(url).toContain('start=2026-08-31T22%3A00%3A00.000Z')
  })
})
