import { describe, expect, it } from 'vitest'
import { slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('ASCII minuscule, accents retirés, séparateurs → _', () => {
    expect(slugify('Setting & Qualification')).toBe('setting_qualification')
    expect(slugify('Élan — Négo (v2)')).toBe('elan_nego_v2')
    expect(slugify('  Relance   spender  ')).toBe('relance_spender')
  })
  it('borne la longueur sans finir par _ et garantit 2 caractères', () => {
    expect(slugify('a'.repeat(50)).length).toBe(32)
    expect(slugify('abcdefghij_klmnopqrst_uvwxyz_abcd_ef')).toBe('abcdefghij_klmnopqrst_uvwxyz_abc')
    expect(slugify('!!')).toBe('xx')
    expect(slugify('é')).toBe('ex')
  })
  it('respecte le check SQL ^[a-z0-9_-]{2,40}$', () => {
    for (const s of ['Boss final', '5 transitions en simultané', 'Tenir le 6€', '📲 Relance']) {
      expect(slugify(s)).toMatch(/^[a-z0-9_]{2,32}$/)
    }
  })
})

describe('uniqueSlug', () => {
  it('suffixe _2, _3… quand le slug est pris', () => {
    expect(uniqueSlug('a', new Set())).toBe('a')
    expect(uniqueSlug('a', new Set(['a']))).toBe('a_2')
    expect(uniqueSlug('a', new Set(['a', 'a_2']))).toBe('a_3')
  })
})
