import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { caseForm, moduleForm } from './schema'

const base = {
  id: null, moduleId: '11111111-1111-4111-8111-111111111111', kind: 'solo', sectionId: null,
  title: 'Cas', phase: 'Qualification', difficulty: '3', maxTurns: '6', isSale: false,
  context: 'ctx', objective: 'obj', targetLine: '',
  fanName: 'Tony', fanBrief: 'brief', expected: 'att', messages: [{ speaker: 'fan', body: 'cc' }],
  reactionMaxS: '', slots: [], fans: [],
}
const fieldErrors = (r: z.ZodSafeParseResult<unknown>) =>
  r.success ? {} : z.flattenError(r.error).fieldErrors

describe('caseForm', () => {
  it('solo valide : nombres coercés, chaînes vides → null', () => {
    const r = caseForm.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.difficulty).toBe(3)
      expect(r.data.maxTurns).toBe(6)
      expect(r.data.targetLine).toBeNull()
      expect(r.data.reactionMaxS).toBeNull()
    }
  })
  it('solo : prénom / consigne / attendu obligatoires', () => {
    const r = caseForm.safeParse({ ...base, fanName: '', fanBrief: '', expected: '' })
    expect(Object.keys(fieldErrors(r)).sort()).toEqual(['expected', 'fanBrief', 'fanName'])
  })
  it('défi : délai obligatoire, exactement 5 conversations, pas de champs fan', () => {
    const slot = { refCaseId: '22222222-2222-4222-8222-222222222222', displayName: 'A' }
    const r = caseForm.safeParse({ ...base, kind: 'arena', fanName: '', fanBrief: '', expected: '', slots: [slot, slot, slot, slot] })
    expect(Object.keys(fieldErrors(r)).sort()).toEqual(['reactionMaxS', 'slots'])
    const ok = caseForm.safeParse({ ...base, kind: 'arena', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', slots: [slot, slot, slot, slot, slot] })
    expect(ok.success).toBe(true)
  })
  it('boss : au moins un fan, âge/couleur facultatifs mais bornés', () => {
    const fan = { name: 'Kevin', age: '', job: '', city: '', color: '', persona: 'p', openingMessage: 'salut', budgetCap: '60', negoThreshold: '', negoWhere: '', meetWhen: '', meetWhere: '', derails: '' }
    expect(fieldErrors(caseForm.safeParse({ ...base, kind: 'boss', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', fans: [] }))).toHaveProperty('fans')
    const ok = caseForm.safeParse({ ...base, kind: 'boss', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', fans: [fan] })
    expect(ok.success).toBe(true)
    if (ok.success) { expect(ok.data.fans[0].age).toBeNull(); expect(ok.data.fans[0].budgetCap).toBe(60); expect(ok.data.fans[0].color).toBeNull() }
    const bad = caseForm.safeParse({ ...base, kind: 'boss', fanName: '', fanBrief: '', expected: '', reactionMaxS: '120', fans: [{ ...fan, age: '12', color: 'rouge' }] })
    expect(bad.success).toBe(false)
  })
  it('difficulté hors 1-10 refusée', () => {
    expect(caseForm.safeParse({ ...base, difficulty: '11' }).success).toBe(false)
  })
})

describe('moduleForm', () => {
  const mod = { id: null, title: 'Setting', emoji: '', description: '', objectiveLabel: 'Objectif', courseMd: '', scoringNotes: '', axes: [], sections: [] }
  it('accepte un module SANS axe (Boss final) et normalise la clé d’axe', () => {
    expect(moduleForm.safeParse(mod).success).toBe(true)
    const r = moduleForm.safeParse({ ...mod, axes: [{ existingId: null, key: ' Naturel ', name: 'N', description: 'd' }] })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.axes[0].key).toBe('naturel')
  })
  it('refuse deux axes de même clé et une clé hors format', () => {
    const a = { existingId: null, key: 'k1', name: 'N', description: 'd' }
    expect(moduleForm.safeParse({ ...mod, axes: [a, a] }).success).toBe(false)
    expect(moduleForm.safeParse({ ...mod, axes: [{ ...a, key: 'Clé accentuée' }] }).success).toBe(false)
  })
  it('refuse une clé d’axe réservée par la notation (casse et espaces normalisés d’abord)', () => {
    const a = { existingId: null, key: 'k1', name: 'N', description: 'd' }
    for (const key of ['total', 'objectif_atteint', 'plafond', 'moments', 'commentaire']) {
      expect(moduleForm.safeParse({ ...mod, axes: [{ ...a, key }] }).success).toBe(false)
    }
    expect(moduleForm.safeParse({ ...mod, axes: [{ ...a, key: ' Total ' }] }).success).toBe(false)
    expect(moduleForm.safeParse({ ...mod, axes: [{ ...a, key: 'total_ventes' }] }).success).toBe(true)
  })
})
