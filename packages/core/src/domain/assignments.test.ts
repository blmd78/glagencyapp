import { describe, expect, it } from 'vitest'
import { planAssignmentSync } from './assignments'

describe('planAssignmentSync — aligner les assignations d’un membre sur le formulaire', () => {
  it('ajoute ce qui manque, retire ce qui n’est plus voulu, ne touche pas au reste', () => {
    const plan = planAssignmentSync(new Set(['emma', 'lea']), ['emma', 'sam'], undefined)
    expect(plan).toEqual({ toAdd: ['sam'], toRemove: ['lea'] })
  })

  it('un appelant à périmètre (manager) ne retire QUE dans son périmètre', () => {
    // `lea` est hors périmètre : une assignation posée par un admin y est préservée (symétrique de
    // mergePages) — le manager ne peut pas vider ce qu'il ne voit pas.
    const plan = planAssignmentSync(new Set(['emma', 'lea']), [], new Set(['emma']))
    expect(plan.toRemove).toEqual(['emma'])
  })

  it('un formulaire identique à l’état courant ne produit AUCUNE écriture', () => {
    expect(planAssignmentSync(new Set(['emma', 'lea']), ['lea', 'emma'], undefined)).toEqual({
      toAdd: [],
      toRemove: [],
    })
  })

  it('les ajouts ne sont pas filtrés par le périmètre : ils ont été validés en amont', () => {
    expect(planAssignmentSync(new Set(), ['emma'], new Set(['lea'])).toAdd).toEqual(['emma'])
  })
})
