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
  it('Zod : notes d\'axe clampées 0-25, moments tronqués à 3, type good|bad, clé d\'axe manquante = échec', () => {
    const z = buildScoreZod(axes)
    const ok = { naturel: 20, lecture: 15, total: 35, objectif_atteint: true, moments: [{ cite: 'x', type: 'bad', probleme: 'p', indice: 'i' }], commentaire: 'c' }
    expect(z.safeParse(ok).success).toBe(true)

    // Une note d'axe hors [0, 25] est clampée, pas rejetée.
    const clamped = z.safeParse({ ...ok, naturel: 30 })
    expect(clamped.success).toBe(true)
    expect((clamped.data as unknown as Record<string, number> | undefined)?.naturel).toBe(25)

    // Plus de 3 moments : tronqué à 3, pas rejeté.
    const withFourMoments = z.safeParse({ ...ok, moments: [ok.moments[0], ok.moments[0], ok.moments[0], ok.moments[0]] })
    expect(withFourMoments.success).toBe(true)
    expect(withFourMoments.data?.moments).toHaveLength(3)

    // Structurel (type hors good|bad) : toujours un échec.
    expect(z.safeParse({ ...ok, moments: [{ ...ok.moments[0], type: 'meh' }] }).success).toBe(false)

    // Structurel (clé d'axe manquante) : toujours un échec.
    const missingAxis: Record<string, unknown> = { ...ok }
    delete missingAxis.naturel
    expect(z.safeParse(missingAxis).success).toBe(false)
  })
  it('`total` hors bornes traverse (recalculé côté serveur) : une notation payante ne rate pas sur une addition du modèle', () => {
    const z = buildScoreZod(axes)
    const ok = { naturel: 20, lecture: 15, total: 35, objectif_atteint: true, moments: [], commentaire: 'c' }
    expect(z.safeParse({ ...ok, total: 140 }).success).toBe(true)
    expect(z.safeParse({ ...ok, total: 87.5 }).success).toBe(true)
  })
})

describe('schéma de notation (boss)', () => {
  it('6 étapes nullables + note + commentaire, notes d\'étape clampées 0-100', () => {
    expect(BOSS_STEPS.map((s) => s.key)).toEqual(['setting', 'transition', 'sexting', 'rencontre', 'nego', 'relationnel'])
    expect(bossScoreJsonSchema.required).toEqual([...BOSS_STEPS.map((s) => s.key), 'note', 'commentaire'])
    expect(bossScoreZod.safeParse({ setting: 70, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null, note: 70, commentaire: 'c' }).success).toBe(true)

    // Une note d'étape hors [0, 100] est clampée, pas rejetée.
    const clamped = bossScoreZod.safeParse({ setting: 150, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null, note: 70, commentaire: 'c' })
    expect(clamped.success).toBe(true)
    expect(clamped.data?.setting).toBe(100)

    // `note` : recalculée par scoreBossThread → hors bornes, elle traverse quand même.
    expect(bossScoreZod.safeParse({ setting: 70, transition: null, sexting: null, rencontre: null, nego: null, relationnel: null, note: 140, commentaire: 'c' }).success).toBe(true)
  })
})
