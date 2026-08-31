import { describe, expect, it } from 'vitest'
import { moduleWheelConfigForm } from './schema'

const ok = { title: 'La roue des modules', segments: [{ label: '6 €', weight: '1', amountEur: '6' }] }

describe('moduleWheelConfigForm', () => {
  it('accepte une config minimale', () => {
    expect(moduleWheelConfigForm.safeParse(ok).success).toBe(true)
  })

  it('refuse un poids VIDÉ : coercé en 0, le secteur sortait du tirage sans un mot', () => {
    const r = moduleWheelConfigForm.safeParse({ ...ok, segments: [{ label: '6 €', weight: '', amountEur: '6' }] })
    expect(r.success).toBe(false)
  })

  it('refuse un montant vide — sur cette roue, tout secteur paie', () => {
    const r = moduleWheelConfigForm.safeParse({ ...ok, segments: [{ label: '6 €', weight: '1', amountEur: '' }] })
    expect(r.success).toBe(false)
  })

  it('refuse une roue dont tous les poids sont à 0 : pickWeighted throw sur une somme nulle', () => {
    const r = moduleWheelConfigForm.safeParse({ ...ok, segments: [{ label: '6 €', weight: '0', amountEur: '6' }] })
    expect(r.success).toBe(false)
  })

  it('refuse zéro segment', () => {
    expect(moduleWheelConfigForm.safeParse({ ...ok, segments: [] }).success).toBe(false)
  })
})
