import { describe, expect, it } from 'vitest'
import { matchCreatorByName } from './creator-match'

const rows = [{ name: 'Emma' }, { name: 'Léa' }, { name: 'Sarah' }, { name: 'sarah' }]
describe('matchCreatorByName', () => {
  it('ignore casse, accents et espaces autour (dossier « EMMA » ↔ Emma, « LEA » ↔ Léa)', () => {
    expect(matchCreatorByName(rows, ' EMMA ')).toEqual({ kind: 'found', row: { name: 'Emma' } })
    expect(matchCreatorByName(rows, 'LEA')).toEqual({ kind: 'found', row: { name: 'Léa' } })
  })
  it('aucune ou plusieurs correspondances → pas de présélection', () => {
    expect(matchCreatorByName(rows, 'OUTILS MANAGERS')).toEqual({ kind: 'none' })
    expect(matchCreatorByName(rows, 'Sarah')).toEqual({ kind: 'ambiguous', rows: [{ name: 'Sarah' }, { name: 'sarah' }] })
  })
})
