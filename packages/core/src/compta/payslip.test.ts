import { describe, expect, it } from 'vitest'
import { computePayslip, HANDOFF_EUR, type PayslipInput } from './payslip'

const base: PayslipInput = {
  rate: 10, fixedAmount: 0,
  modelCa: {}, fixeSetter: 0, bonus: 0, malus: 0, handoffs: 0, primeDue: 0, sanctions: 0,
}

describe('computePayslip — base', () => {
  it('applique le taux modele par modele puis somme', () => {
    const r = computePayslip({ ...base, modelCa: { a: 2500, b: 1700 } })
    expect(r.ca).toBe(4200)
    expect(r.base).toBe(420)
    expect(r.net).toBe(420)
  })

  it('chaque modele est ARRONDI avant la somme, pas apres', () => {
    // 4 modeles a 100,05 EUR, 10 % : chaque ligne vaut 10,005 -> 10,01 arrondie, soit 40,04.
    // L ancienne formule (round2 de la somme brute) donnait 40,02 : les 4 lignes affichees
    // dans la fiche n auraient pas fait le total affiche. Ecart de 2 centimes, assume.
    const r = computePayslip({ ...base, modelCa: { a: 100.05, b: 100.05, c: 100.05, d: 100.05 } })
    expect(r.ca).toBe(400.2)
    // Les 4 lignes affichees par la fiche : 10,01 chacune. Leur somme EST la base.
    expect(r.base).toBe(40.04)
    expect(r.net).toBe(40.04)
  })
})

describe('computePayslip — le fixe', () => {
  it("s AJOUTE a la commission, il ne la remplace jamais", () => {
    // LA regression du 2026-07-27 : `mode: 'fixed'` faisait REMPLACER la commission par le fixe.
    // 1000 EUR a 10 % = 100 de commission, 75 de fixe : les trois nombres (100, 75, 175) sont
    // distincts, donc un remplacement (net 75) comme un fixe ignore (net 100) tombent ici.
    const r = computePayslip({ ...base, modelCa: { a: 1000 }, fixedAmount: 75 })
    expect(r.base).toBe(100)
    expect(r.setter).toBe(75)
    expect(r.net).toBe(175)
  })

  it("est un montant PAR PERIODE : il n est multiplie par rien", () => {
    // L ancienne formule versait `fixedAmount * weekCount` (2 semaines) = 150. La feuille du
    // proprietaire ne remplit le fixe QU UNE fois par periode de paie, jamais par semaine.
    expect(computePayslip({ ...base, fixedAmount: 75 }).setter).toBe(75)
  })

  it("s applique des qu il est renseigne — aucun drapeau ne le commande", () => {
    // `compta_settings.is_setter` a disparu (0089) : il valait faux par defaut et aurait retenu
    // le fixe de 59 personnes. Un fixe a 0 ne fait simplement pas de ligne.
    expect(computePayslip({ ...base, fixedAmount: 40 }).setter).toBe(40)
    expect(computePayslip({ ...base, fixedAmount: 0 }).setter).toBe(0)
  })

  it('une saisie hebdo REMPLACE le fixe du reglage pour cette periode', () => {
    // Le demi-fixe a 37,50 EUR releve sur la feuille. 112,50 (addition) et 75 (reglage seul)
    // sont les deux erreurs possibles : ni l un ni l autre n est 37,50.
    const r = computePayslip({ ...base, fixedAmount: 75, fixeSetter: 37.5 })
    expect(r.setter).toBe(37.5)
    expect(r.setterAdjusted).toBe(true)
  })

  it('une saisie hebdo seule vaut fixe de la periode, sans reglage', () => {
    const r = computePayslip({ ...base, fixedAmount: 0, fixeSetter: 40 })
    expect(r.setter).toBe(40)
    expect(r.setterAdjusted).toBe(true)
  })

  it("sans saisie hebdo, c est le reglage qui s applique — et la fiche doit pouvoir le dire", () => {
    const r = computePayslip({ ...base, fixedAmount: 75, fixeSetter: 0 })
    expect(r.setter).toBe(75)
    expect(r.setterAdjusted).toBe(false)
  })

  it('reproduit une ligne de la feuille : commission + fixe + handoffs', () => {
    // Ordres de grandeur de la ligne « Carl » relevee sur la feuille de juillet (plan, tache 16) :
    // 4,379 EUR de commission + 75 EUR de fixe + 19,20 EUR de handoffs = 98,579 EUR.
    // Le CA de 43,79 EUR est celui qui PRODUIT cette commission a 10 % — il n a pas ete releve.
    // Le net vaut 98,58 et non 98,579 : la feuille ne borne pas ses decimales, la fiche arrondit
    // chaque composante au centime (spec §4).
    const r = computePayslip({ ...base, modelCa: { a: 43.79 }, fixedAmount: 75, handoffs: 32 })
    expect(r.base).toBe(4.38)
    expect(r.setter).toBe(75)
    expect(r.handoffsAmount).toBe(19.2)
    expect(r.net).toBe(98.58)
  })
})

describe('computePayslip — composantes', () => {
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

  it('une periode entierement vide donne 0 partout', () => {
    const r = computePayslip(base)
    expect(r).toEqual({
      ca: 0, base: 0, setter: 0, setterAdjusted: false, bonus: 0, malus: 0,
      handoffsAmount: 0, prime: 0, sanctions: 0, net: 0,
    })
  })
})

describe('computePayslip — invariant', () => {
  it('net = base + setter + bonus - malus + handoffs + prime - sanctions', () => {
    const r = computePayslip({
      rate: 12.5, fixedAmount: 0,
      modelCa: { a: 3333.33, b: 1111.11 }, fixeSetter: 150, bonus: 50, malus: 20,
      handoffs: 7, primeDue: 100, sanctions: 45,
    })
    // Valeurs calculees a la main (pas a partir du resultat de `r`) : le taux 12,5 % sur
    // 3333,33 / 1111,11 stresse deliberement l'arrondi flottant.
    // lignes de la fiche : 3333,33*0,125 = 416,66625 -> 416,67
    //                      1111,11*0,125 = 138,88875 -> 138,89
    // base = 416,67 + 138,89 = 555,56.
    //
    // CE QUE CE TEST DISCRIMINE (verifie en reintroduisant chaque formule) : l'arrondi PAR
    // MODELE. Avec l'ancienne formule `round2(somme brute)`, la somme brute vaut 555,555,
    // representee 555,5499999999999 en flottant -> base 555,55 et net 794,75. Les deux
    // valeurs ci-dessous changeraient donc si l'arrondi par modele etait retire.
    expect(r.ca).toBe(4444.44)
    expect(r.base).toBe(555.56)
    expect(r.setter).toBe(150)
    expect(r.bonus).toBe(50)
    expect(r.malus).toBe(20)
    expect(r.handoffsAmount).toBe(4.2)
    expect(r.prime).toBe(100)
    expect(r.sanctions).toBe(45)
    // net = 555,56 + 150 + 50 - 20 + 4,2 + 100 - 45 = 794,76
    expect(r.net).toBe(794.76)
  })

  it('les composantes sont arrondies AVANT d etre sommees dans le net', () => {
    // Ce test-ci garde l'autre invariant (arrondi composante par composante, `payslip.ts`).
    // Il exige des entrees SOUS LE CENTIME : depuis que la base est arrondie modele par
    // modele, toutes les composantes issues de la base valent deja 2 decimales, et aucun jeu
    // d'entrees a 2 decimales ne distingue plus les deux ordres (verifie par balayage).
    // Les colonnes numeriques de la compta sont toutes en `numeric(_, 2)` (verifie sur
    // information_schema, UAT) : ce cas n'est pas atteignable depuis la base AUJOURD'HUI —
    // c'est le CONTRAT de la fonction pure qu'il protege, pour le jour ou une entree
    // sous-centime arrivera (taux par modele, prorata, devise convertie).
    const r = computePayslip({
      ...base,
      modelCa: { a: 1000 }, bonus: 0.004, primeDue: 0.004, handoffs: 7,
    })
    // bonus 0,004 -> 0,00 et prime 0,004 -> 0,00 : le net ne gagne PAS le centime que la
    // somme brute (100 + 0,008 + 4,2) ferait apparaitre a 104,21.
    expect(r.bonus).toBe(0)
    expect(r.prime).toBe(0)
    expect(r.base).toBe(100)
    expect(r.handoffsAmount).toBe(4.2)
    expect(r.net).toBe(104.2)
  })
})
