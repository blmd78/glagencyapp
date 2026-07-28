import { describe, expect, it } from 'vitest'
import { computePayslip, HANDOFF_EUR, type PayslipInput } from './payslip'

const base: PayslipInput = {
  rate: 10, fixedAmount: 0,
  modelCa: {}, bonus: 0, malus: 0, handoffs: 0, primeDue: 0, sanctions: 0,
  carryover: 0, setterPrime: 0, monthlyPrime: 0,
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

  it('est le montant des REGLAGES tel quel : ni drapeau, ni multiplication, ni ajustement', () => {
    // UN SEUL test la ou il y en avait quatre, parce qu il n y a plus qu UNE source du fixe
    // (`compta_settings.fixed_amount`) : les trois autres re-affirmaient `setter === fixedAmount`
    // sous des angles que le TYPE d entree rend desormais inexprimables — c est exactement le
    // genre de test qui devient tautologique en survivant a ce qu il gardait.
    //
    // TROIS regressions distinctes, toutes survenues sur cette feature, tombent encore ici :
    //  - `is_setter` (migration 0089) retenait le fixe derriere un drapeau faux par defaut,
    //    donc 59 personnes a 0 ;
    //  - `fixedAmount * weekCount` le versait DOUBLE — c est un montant par PERIODE ;
    //  - `fixeSetter` (retire tache 19) pouvait le REMPLACER : saisi par semaine, donc affiche
    //    2 fois par periode et SOMME par `compta-rows.ts`, il versait 150 pour 75 saisis.
    //
    // Trois valeurs : un fixe ignore (0 partout), double (80 / 150) ou fige sur une constante
    // echoue sur au moins une des trois.
    expect(computePayslip({ ...base, fixedAmount: 40 }).setter).toBe(40)
    expect(computePayslip({ ...base, fixedAmount: 75 }).setter).toBe(75)
    expect(computePayslip({ ...base, fixedAmount: 0 }).setter).toBe(0)
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
    // `toEqual` et non des assertions champ par champ : il compare la FORME complete de la
    // sortie. C est lui qui garde la disparition de `setterAdjusted` (tache 19) — le rendre
    // de nouveau ferait echouer ce test sur une cle en trop, sans que personne ait a y penser.
    // Depuis la tache 22 il garde AUSSI la presence des trois lignes du lot final : les fondre
    // dans `prime` (au lieu de les exposer separement, comme la feuille) fait tomber ce test.
    expect(r).toEqual({
      ca: 0, base: 0, setter: 0, bonus: 0, malus: 0,
      handoffsAmount: 0, prime: 0, sanctions: 0,
      carryover: 0, setterPrime: 0, monthlyPrime: 0, net: 0,
    })
  })
})

describe('computePayslip — les trois lignes du lot final', () => {
  // Trois valeurs DISTINCTES et distinctes de la prime d embauche : fondre deux de ces lignes
  // l une dans l autre, ou en oublier une dans le net, se voit dans les nombres.
  const trio = { ...base, modelCa: { a: 1000 }, carryover: 30, setterPrime: 117.5, monthlyPrime: 60 }

  it('le report de la periode precedente s ajoute au net', () => {
    const r = computePayslip({ ...base, modelCa: { a: 1000 }, carryover: 30 })
    expect(r.carryover).toBe(30)
    expect(r.net).toBe(130) // 100 de commission + 30 de report
  })

  it('le report est SIGNE : un trop-percu se reporte en negatif', () => {
    // Seule entree signee de la formule. Un `Math.abs` ou un `- carryover` recopie sur le malus
    // (stocke positif, soustrait) donnerait 120 ou 80 au lieu de 80... donc trois valeurs
    // distinctes : 100 (report ignore), 120 (signe inverse), 80 (attendu).
    const r = computePayslip({ ...base, modelCa: { a: 1000 }, carryover: -20 })
    expect(r.carryover).toBe(-20)
    expect(r.net).toBe(80)
  })

  it('la prime setter (TOP15) s ajoute au net, sur sa propre ligne', () => {
    const r = computePayslip({ ...base, modelCa: { a: 1000 }, setterPrime: 117.5 })
    expect(r.setterPrime).toBe(117.5)
    expect(r.prime).toBe(0) // pas confondue avec la prime d embauche
    expect(r.net).toBe(217.5)
  })

  it('la prime du mois (TOP3) s ajoute au net, sur sa propre ligne', () => {
    const r = computePayslip({ ...base, modelCa: { a: 1000 }, monthlyPrime: 60 })
    expect(r.monthlyPrime).toBe(60)
    expect(r.prime).toBe(0)
    expect(r.net).toBe(160)
  })

  it('les trois cohabitent, chacune lisible, et le net les contient toutes', () => {
    const r = computePayslip(trio)
    expect(r.carryover).toBe(30)
    expect(r.setterPrime).toBe(117.5)
    expect(r.monthlyPrime).toBe(60)
    // 100 + 30 + 117,5 + 60. Le net est la SOMME DES LIGNES AFFICHEES : c est ce qui permet a un
    // chatteur de refaire sa fiche de tete (spec §4).
    expect(r.net).toBe(307.5)
    expect(r.net).toBe(r.base + r.carryover + r.setterPrime + r.monthlyPrime)
  })
})

describe('computePayslip — invariant', () => {
  it('net = base + setter + bonus - malus + handoffs + prime - sanctions + report + primes', () => {
    const r = computePayslip({
      rate: 12.5, fixedAmount: 150,
      modelCa: { a: 3333.33, b: 1111.11 }, bonus: 50, malus: 20,
      handoffs: 7, primeDue: 100, sanctions: 45,
      carryover: -12.5, setterPrime: 117.5, monthlyPrime: 60,
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
    expect(r.carryover).toBe(-12.5)
    expect(r.setterPrime).toBe(117.5)
    expect(r.monthlyPrime).toBe(60)
    // 555,56 + 150 + 50 - 20 + 4,2 + 100 - 45 = 794,76 (le net d avant la tache 22),
    // puis - 12,5 + 117,5 + 60 = 959,76.
    expect(r.net).toBe(959.76)
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
      // Les trois lignes de la tache 22 sont soumises a la MEME regle que les anciennes : leur
      // arrondi doit preceder la somme, sinon elles reintroduisent l ecart a elles seules.
      carryover: 0.004, setterPrime: 0.004, monthlyPrime: 0.004,
    })
    // Chaque composante sous le centime -> 0,00 : le net ne gagne PAS les deux centimes que la
    // somme brute (100 + 5 x 0,004 + 4,2 = 104,22) ferait apparaitre.
    expect(r.bonus).toBe(0)
    expect(r.prime).toBe(0)
    expect(r.carryover).toBe(0)
    expect(r.setterPrime).toBe(0)
    expect(r.monthlyPrime).toBe(0)
    expect(r.base).toBe(100)
    expect(r.handoffsAmount).toBe(4.2)
    expect(r.net).toBe(104.2)
  })
})
