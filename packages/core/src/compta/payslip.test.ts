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

  it('mode fixed : le net cumule les composantes malgre le CA ignore dans la base', () => {
    const r = computePayslip({
      ...base,
      mode: 'fixed', fixedAmount: 150, weekCount: 2, modelCa: { a: 5000 },
      isSetter: true, fixeSetter: 80, bonus: 10, malus: 5, handoffs: 3, primeDue: 20, sanctions: 15,
    })
    // base = 150 * 2 = 300 (CA ignore) ; setter = 80 ; handoffs = 3 * 0,60 = 1,8
    // net = 300 + 80 + 10 - 5 + 1,8 + 20 - 15 = 391,8
    expect(r.base).toBe(300)
    expect(r.net).toBe(391.8)
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
    // Valeurs calculees a la main (pas a partir du resultat de `r`) : le taux 12,5 % sur
    // 3333,33 / 1111,11 stresse deliberement l'arrondi flottant.
    // base brute = 3333,33*0,125 + 1111,11*0,125 = 555,555 -> en flottant 555,5499999999999...
    // -> round2 = 555,55 (et NON 555,56)
    expect(r.ca).toBe(4444.44)
    expect(r.base).toBe(555.55)
    expect(r.setter).toBe(150)
    expect(r.bonus).toBe(50)
    expect(r.malus).toBe(20)
    expect(r.handoffsAmount).toBe(4.2)
    expect(r.prime).toBe(100)
    expect(r.sanctions).toBe(45)
    // net = 555,55 + 150 + 50 - 20 + 4,2 + 100 - 45 = 794,75
    // (avec un round2 unique en fin de chaine sur les valeurs BRUTES, le calcul donnerait
    // 794,76 : c'est precisement ce que ce test doit detecter si l'arrondi composante par
    // composante est retire.)
    expect(r.net).toBe(794.75)
  })
})
