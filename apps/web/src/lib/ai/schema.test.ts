import { describe, expect, it } from 'vitest'
import { BOSS_STEPS, bossScoreJsonSchema, bossScoreZod, buildScoreJsonSchema, buildScoreZod } from './schema'

const axes = [{ key: 'naturel', name: 'Naturel', description: 'd1' }, { key: 'lecture', name: 'Lecture', description: 'd2' }]

describe('schéma de notation (module)', () => {
  it('JSON schema : un entier par axe + total, objectif_atteint, moments, commentaire ; strict', () => {
    const s = buildScoreJsonSchema(axes)
    expect(Object.keys(s.properties)).toEqual(['naturel', 'lecture', 'total', 'objectif_atteint', 'plafond', 'moments', 'commentaire'])
    expect(s.required).toEqual(['naturel', 'lecture', 'total', 'objectif_atteint', 'moments', 'commentaire'])
    expect(s.additionalProperties).toBe(false)
  })
  it('Zod : bornes 0-25 par axe, moments ≤ 3, type good|bad', () => {
    const z = buildScoreZod(axes)
    const ok = { naturel: 20, lecture: 15, total: 35, objectif_atteint: true, moments: [{ cite: 'x', type: 'bad', probleme: 'p', indice: 'i' }], commentaire: 'c' }
    expect(z.safeParse(ok).success).toBe(true)
    expect(z.safeParse({ ...ok, naturel: 26 }).success).toBe(false)
    expect(z.safeParse({ ...ok, moments: [ok.moments[0], ok.moments[0], ok.moments[0], ok.moments[0]] }).success).toBe(false)
    expect(z.safeParse({ ...ok, moments: [{ ...ok.moments[0], type: 'meh' }] }).success).toBe(false)
  })
})

describe('schéma de notation (boss)', () => {
  it('6 étapes nullables + note + commentaire', () => {
    expect(BOSS_STEPS.map((s) => s.key)).toEqual(['setting', 'transition', 'sexting', 'rencontre', 'nego', 'relationnel'])
    expect(bossScoreJsonSchema.required).toEqual([...BOSS_STEPS.map((s) => s.key), 'note', 'commentaire'])
    expect(bossScoreZod.safeParse({ setting: 70, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null, note: 70, commentaire: 'c' }).success).toBe(true)
    expect(bossScoreZod.safeParse({ setting: 101, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null, note: 70, commentaire: 'c' }).success).toBe(false)
  })
})
