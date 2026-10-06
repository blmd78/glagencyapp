import { describe, expect, it } from 'vitest'
import { duplicateMemberIds, linkSuggestions } from './member-link-hints'

const member = (
  id: string,
  displayName: string,
  over: Partial<{ email: string; role: string; chatterId: string; leftAt: string | null }> = {},
) => ({
  id,
  displayName,
  email: over.email ?? `${id}@exemple.fr`,
  role: over.role ?? 'chatteur',
  chatterId: over.chatterId ?? '',
  leftAt: over.leftAt ?? null,
})

describe('linkSuggestions (filtre « À rattacher » de Membres)', () => {
  it('propose la fiche MyPuls libre au même nom, sans casse ni ponctuation', () => {
    const s = linkSuggestions([member('m1', "O'Neal")], [{ id: 'c1', name: 'O NEAL' }])
    expect(s.get('m1')).toEqual([{ id: 'c1', name: 'O NEAL' }])
  })
  it('rapproche aussi par e-mail (fiche nommée par l’e-mail) et ignore « (accès révoqué) »', () => {
    const s = linkSuggestions(
      [member('m1', 'Steven', { email: 'rstevenlih@gmail.com' })],
      [{ id: 'c1', name: 'rstevenlih@gmail.com (accès révoqué)' }],
    )
    expect(s.get('m1')?.map((c) => c.id)).toEqual(['c1'])
  })
  it('ignore les accents : « Souké » ↔ « Souke »', () => {
    expect(linkSuggestions([member('m1', 'Souké')], [{ id: 'c1', name: 'Souke' }]).has('m1')).toBe(true)
  })
  it('ne propose jamais une fiche déjà liée à un autre membre', () => {
    const s = linkSuggestions(
      [member('m1', 'JC'), member('m2', 'JC', { chatterId: 'c1' })],
      [{ id: 'c1', name: 'JC' }],
    )
    expect(s.has('m1')).toBe(false)
  })
  it('ne concerne que les chatteurs en poste sans fiche liée', () => {
    const fiches = [{ id: 'c1', name: 'Abiola' }, { id: 'c2', name: 'Linah' }, { id: 'c3', name: 'René' }]
    const s = linkSuggestions(
      [
        member('lie', 'Abiola', { chatterId: 'autre' }),
        member('parti', 'Linah', { leftAt: '2026-09-01' }),
        member('manager', 'René', { role: 'manager' }),
      ],
      fiches,
    )
    expect(s.size).toBe(0)
  })
  it('aucune fiche au même nom → pas de suggestion', () => {
    expect(linkSuggestions([member('m1', 'Josaphat')], [{ id: 'c1', name: 'Joh' }]).size).toBe(0)
  })
})

describe('duplicateMemberIds (filtre « Doublons » de Membres)', () => {
  it('regroupe les membres en poste au même nom, casse et accents ignorés', () => {
    const ids = duplicateMemberIds([member('a', 'JC'), member('b', 'jc'), member('c', 'Junot'), member('d', 'Abiola')])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })
  it('un homonyme déjà parti ne compte pas : le doublon est déjà réglé', () => {
    expect(duplicateMemberIds([member('a', 'Oswald'), member('b', 'Oswald', { leftAt: '2026-08-01' })]).size).toBe(0)
  })
})
