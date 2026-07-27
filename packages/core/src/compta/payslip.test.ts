import { describe, expect, it } from 'vitest'
import { computePayslip, HANDOFF_EUR, type PayslipInput } from './payslip'

const base: PayslipInput = {
  mode: 'percent', rate: 10, fixedAmount: 0, isSetter: false, weekCount: 2,
  modelCa: {}, fixeSetter: 0, bonus: 0, malus: 0, handoffs: 0, primeDue: 0, sanctions: 0,
}

describe('computePayslip — base', () => {
  it('mode percent : somme le CA par modele puis applique le taux', () => {
    const r = computePayslip({ ...base, modelCa: { a: 2500, b: 1700 } })
    expect(r.ca).toBe(4200)
    expect(r.base).toBe(420)
    expect(r.net).toBe(420)
  })

  it('mode fixed : le fixe est HEBDOMADAIRE, multiplie par le nombre de semaines', () => {
    const r = computePayslip({ ...base, mode: 'fixed', fixedAmount: 200, weekCount: 2, modelCa: { a: 9999 } })
    expect(r.base).toBe(400)
    expect(r.ca).toBe(9999) // le CA reste affiche, mais n entre pas dans la base
  })

  it('mode fixed sur une quinzaine a 3 semaines', () => {
    expect(computePayslip({ ...base, mode: 'fixed', fixedAmount: 200, weekCount: 3 }).base).toBe(600)
  })
})

describe('computePayslip — composantes', () => {
  it('le fixe setter ne compte que si is_setter', () => {
    expect(computePayslip({ ...base, fixeSetter: 300, isSetter: false }).setter).toBe(0)
    expect(computePayslip({ ...base, fixeSetter: 300, isSetter: true }).setter).toBe(300)
  })

  it('les handoffs sont payes 0,60 EUR l unite', () => {
    expect(HANDOFF_EUR).toBe(0.6)
    expect(computePayslip({ ...base, handoffs: 12 }).handoffsAmount).toBe(7.2)
  })

  it('cumule le malus manuel ET les sanctions police', () => {
    const r = computePayslip({ ...base, modelCa: { a: 7200 }, malus: 20, sanctions: 45 })
    expect(r.base).toBe(720)
    expect(r.malus).toBe(20)
    expect(r.sanctions).toBe(45)
    expect(r.net).toBe(655)
  })

  it('ajoute la prime quand elle est due', () => {
    expect(computePayslip({ ...base, modelCa: { a: 7200 }, primeDue: 100 }).net).toBe(820)
  })

  it('une quinzaine entierement vide donne 0 partout', () => {
    const r = computePayslip(base)
    expect(r).toEqual({
      ca: 0, base: 0, setter: 0, bonus: 0, malus: 0,
      handoffsAmount: 0, prime: 0, sanctions: 0, net: 0,
    })
  })
})

describe('computePayslip — invariant', () => {
  it('net = base + setter + bonus - malus + handoffs + prime - sanctions', () => {
    const r = computePayslip({
      mode: 'percent', rate: 12.5, fixedAmount: 0, isSetter: true, weekCount: 2,
      modelCa: { a: 3333.33, b: 1111.11 }, fixeSetter: 150, bonus: 50, malus: 20,
      handoffs: 7, primeDue: 100, sanctions: 45,
    })
    const expected =
      r.base + r.setter + r.bonus - r.malus + r.handoffsAmount + r.prime - r.sanctions
    expect(r.net).toBeCloseTo(expected, 2)
  })
})
