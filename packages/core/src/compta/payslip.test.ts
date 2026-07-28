import { describe, expect, it } from 'vitest'
import { computePayslip, HANDOFF_EUR, type PayslipInput, type RateSegmentInput } from './payslip'

/** Un segment sur TOUTE la periode 06 -> 19/07/2026 — le cas usuel, taux inchange. */
const seg = (rate: number, modelCa: Record<string, number>): RateSegmentInput => ({
  from: '2026-07-06', to: '2026-07-19', rate, fallback: false, modelCa,
})
/** Les deux SEMAINES de la periode — le grain du changement de taux observe sur la feuille. */
const s1 = (rate: number, modelCa: Record<string, number>): RateSegmentInput => ({
  from: '2026-07-06', to: '2026-07-12', rate, fallback: false, modelCa,
})
const s2 = (rate: number, modelCa: Record<string, number>): RateSegmentInput => ({
  from: '2026-07-13', to: '2026-07-19', rate, fallback: false, modelCa,
})

const base: PayslipInput = {
  segments: [], fixedAmount: 0,
  bonus: 0, malus: 0, handoffs: 0, primeDue: 0, sanctions: 0, setterPrime: 0,
}

describe('computePayslip — base', () => {
  it('applique le taux modele par modele puis somme', () => {
    const r = computePayslip({ ...base, segments: [seg(10, { a: 2500, b: 1700 })] })
    expect(r.ca).toBe(4200)
    expect(r.base).toBe(420)
    expect(r.net).toBe(420)
  })

  it('chaque modele est ARRONDI avant la somme, pas apres', () => {
    // 4 modeles a 100,05 EUR, 10 % : chaque ligne vaut 10,005 -> 10,01 arrondie, soit 40,04.
    // L ancienne formule (round2 de la somme brute) donnait 40,02 : les 4 lignes affichees
    // dans la fiche n auraient pas fait le total affiche. Ecart de 2 centimes, assume.
    const r = computePayslip({
      ...base,
      segments: [seg(10, { a: 100.05, b: 100.05, c: 100.05, d: 100.05 })],
    })
    expect(r.ca).toBe(400.2)
    // Les 4 lignes affichees par la fiche : 10,01 chacune. Leur somme EST la base.
    expect(r.base).toBe(40.04)
    expect(r.net).toBe(40.04)
    expect(r.segments[0]?.models.map((m) => m.commission)).toEqual([10.01, 10.01, 10.01, 10.01])
  })
})

describe('computePayslip — le fixe', () => {
  it("s AJOUTE a la commission, il ne la remplace jamais", () => {
    // LA regression du 2026-07-27 : `mode: 'fixed'` faisait REMPLACER la commission par le fixe.
    // 1000 EUR a 10 % = 100 de commission, 75 de fixe : les trois nombres (100, 75, 175) sont
    // distincts, donc un remplacement (net 75) comme un fixe ignore (net 100) tombent ici.
    const r = computePayslip({ ...base, segments: [seg(10, { a: 1000 })], fixedAmount: 75 })
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

  it('le fixe est PAR PERIODE, pas par segment de taux', () => {
    // Le decoupage par taux (2026-07-28) multiplie le nombre de blocs affiches. Le fixe, lui,
    // reste versé UNE fois : `fixedAmount * segments.length` verserait 150 pour 75 regles — la
    // meme erreur que `fixedAmount * weekCount` (tache 16), un cran plus loin.
    const r = computePayslip({
      ...base,
      segments: [s1(10, { a: 500 }), s2(11, { a: 500 })],
      fixedAmount: 75,
    })
    expect(r.setter).toBe(75)
    expect(r.net).toBe(180) // 50 + 55 + 75
  })

  it('reproduit une ligne de la feuille : commission + fixe + handoffs', () => {
    // Ordres de grandeur de la ligne « Carl » relevee sur la feuille de juillet (plan, tache 16) :
    // 4,379 EUR de commission + 75 EUR de fixe + 19,20 EUR de handoffs = 98,579 EUR.
    // Le CA de 43,79 EUR est celui qui PRODUIT cette commission a 10 % — il n a pas ete releve.
    // Le net vaut 98,58 et non 98,579 : la feuille ne borne pas ses decimales, la fiche arrondit
    // chaque composante au centime (spec §4).
    const r = computePayslip({
      ...base, segments: [seg(10, { a: 43.79 })], fixedAmount: 75, handoffs: 32,
    })
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
    const r = computePayslip({ ...base, segments: [seg(10, { a: 7200 })], malus: 20, sanctions: 45 })
    expect(r.base).toBe(720)
    expect(r.malus).toBe(20)
    expect(r.sanctions).toBe(45)
    expect(r.net).toBe(655)
  })

  it('ajoute la prime quand elle est due', () => {
    expect(computePayslip({ ...base, segments: [seg(10, { a: 7200 })], primeDue: 100 }).net).toBe(820)
  })

  it('une periode entierement vide donne 0 partout', () => {
    const r = computePayslip(base)
    // `toEqual` et non des assertions champ par champ : il compare la FORME complete de la
    // sortie. C est lui qui garde la disparition de `setterAdjusted` (tache 19) — le rendre
    // de nouveau ferait echouer ce test sur une cle en trop, sans que personne ait a y penser.
    // Depuis le 2026-07-28 il garde AUSSI la disparition de `carryover` et `monthlyPrime`
    // (report et prime du mois, retires a la demande de Benoit) : les reintroduire dans la
    // sortie fait tomber ce test sur une cle en trop.
    // Depuis la tache 27, il garde la ventilation par TAUX (`segments`) : sans CA, elle est vide.
    expect(r).toEqual({
      ca: 0, base: 0, segments: [], setter: 0, bonus: 0, malus: 0,
      handoffsAmount: 0, prime: 0, sanctions: 0, setterPrime: 0, net: 0,
    })
  })
})

describe('computePayslip — la prime setter (TOP15)', () => {
  // Le « lot final » de la tache 22 portait trois lignes ; le report (`carryover`) et la prime
  // du mois (`monthlyPrime`) ont ete RETIRES le 2026-07-28 (decision de Benoit). Seule reste la
  // prime setter — calculee par `rankSetters`, jamais saisie.
  it('s ajoute au net, sur sa propre ligne', () => {
    const r = computePayslip({ ...base, segments: [seg(10, { a: 1000 })], setterPrime: 117.5 })
    expect(r.setterPrime).toBe(117.5)
    expect(r.prime).toBe(0) // pas confondue avec la prime d embauche
    expect(r.net).toBe(217.5)
    expect(r.net).toBe(r.base + r.setterPrime)
  })
})

describe('computePayslip — le taux DATE', () => {
  it('chaque segment est paye a SON taux', () => {
    // 1000 a 10 % puis 1000 a 11 % = 210. Un taux unique donnerait 200 (le premier) ou 220 (le
    // second) ; une moyenne des deux, 205. Les quatre valeurs sont distinctes.
    const r = computePayslip({ ...base, segments: [s1(10, { a: 1000 }), s2(11, { a: 1000 })] })
    expect(r.ca).toBe(2000)
    expect(r.base).toBe(210)
    expect(r.net).toBe(210)
  })

  it('la fiche porte un bloc par segment, dans l ordre, avec ses dates et son taux', () => {
    const r = computePayslip({
      ...base, segments: [s1(10, { Lana: 600, Mia: 400 }), s2(11, { Lana: 1000 })],
    })
    expect(r.segments).toEqual([
      {
        from: '2026-07-06', to: '2026-07-12', rate: 10, fallback: false,
        ca: 1000, commission: 100,
        models: [
          { name: 'Lana', ca: 600, commission: 60 },
          { name: 'Mia', ca: 400, commission: 40 },
        ],
      },
      {
        from: '2026-07-13', to: '2026-07-19', rate: 11, fallback: false,
        ca: 1000, commission: 110,
        models: [{ name: 'Lana', ca: 1000, commission: 110 }],
      },
    ])
  })

  it('LE DETAIL FAIT LE TOTAL a chaque niveau, y compris avec deux taux', () => {
    // L invariant qui a fait passer la base a `Σ round2(ca × taux)` (2026-07-27), etendu au
    // decoupage : la fiche affiche des lignes-modele DANS des blocs-segment DANS un total.
    // Les trois niveaux doivent s additionner exactement, sinon la fiche ne vaut rien.
    // Valeurs choisies pour que chaque arrondi morde : 33,33 a 10,5 % = 3,49965 -> 3,50.
    const r = computePayslip({
      ...base,
      segments: [
        s1(10.5, { a: 33.33, b: 66.67, c: 99.99 }),
        s2(11, { a: 33.33, b: 66.67, c: 99.99 }),
      ],
    })
    for (const s of r.segments) {
      expect(s.commission).toBe(s.models.reduce((t, m) => t + m.commission, 0))
      expect(s.ca).toBe(s.models.reduce((t, m) => t + m.ca, 0))
    }
    expect(r.base).toBe(r.segments.reduce((t, s) => t + s.commission, 0))
    expect(r.ca).toBe(r.segments.reduce((t, s) => t + s.ca, 0))
    // Les nombres eux-memes, calcules a la main : 3,50 + 7,00 + 10,50 = 21,00 a 10,5 % ;
    // 3,67 + 7,33 + 11,00 = 22,00 a 11 %. Base 43,00.
    expect(r.segments[0]?.commission).toBe(21)
    expect(r.segments[1]?.commission).toBe(22)
    expect(r.base).toBe(43)
  })

  it('UN SEUL segment rend exactement ce que rendait le taux unique', () => {
    // La garantie de non-regression, en un test : la decoupe ne doit RIEN changer la ou le taux
    // ne change pas. Ce sont les 83 chatteurs de la feuille de juillet qui tombaient deja au
    // centime — ils ne doivent pas bouger d un centime.
    const un = computePayslip({ ...base, segments: [seg(10, { a: 1234.56, b: 789.01 })] })
    // Meme CA, meme taux, coupe en deux blocs : les termes arrondis ne sont plus les memes,
    // donc les DEUX resultats ne peuvent pas etre confondus par hasard.
    expect(un.base).toBe(202.36) // round2(123,456) + round2(78,901) = 123,46 + 78,90
    expect(un.segments).toHaveLength(1)
  })

  it('le taux par DEFAUT est marque dans le segment, pas fondu dedans', () => {
    // `fallback` traverse le calcul jusqu a la fiche : c est ce qui lui permet d ecrire « taux
    // par defaut — jamais regle ». Le perdre en route rendrait le taux implicite de nouveau
    // invisible, ce que la spec §4 refuse.
    const r = computePayslip({
      ...base,
      segments: [
        { from: '2026-07-06', to: '2026-07-12', rate: 10, fallback: true, modelCa: { a: 1000 } },
        s2(11, { a: 1000 }),
      ],
    })
    expect(r.segments.map((s) => s.fallback)).toEqual([true, false])
  })
})

describe('computePayslip — reconciliation feuille de juillet (06 -> 19/07/2026)', () => {
  /**
   * LES 12 CHATTEURS DONT LE TAUX CHANGE ENTRE LES DEUX SEMAINES DE LA PERIODE.
   *
   * Chiffres RELEVES sur la feuille du proprietaire (export CSV, 2026-07-28), colonnes L9-L15
   * (bloc S1), L23-L31 (bloc S2) et L35 (`-NET TOTAL-`). Les taux ne sont pas ecrits dans la
   * feuille : ils sont DEDUITS de `net_semaine / CA_semaine`, et les 95 colonnes portant du CA
   * en S1 rendent toutes une valeur ronde — 10 / 10,5 / 11 %, jamais autre chose.
   *
   * `[ca1, ca2, r1, r2, bonus, malus, total attendu]`.
   */
  const SHEET: [string, number, number, number, number, number, number, number][] = [
    ['Alain',       2408.82, 4144.83, 10.5, 11,   0,  0,  708.8574],
    ['Ange',        1461.47, 1433.25, 10,   10.5, 0,  5,  291.63825],
    ['Anja',        2493.47, 1355.92, 10,   10.5, 60, 0,  451.7186],
    ['Big Jo',      1828.59, 2192.6,  10,   10.5, 10, 0,  423.082],
    ['Ethane',      1115.67, 3624.66, 10,   11,   0,  0,  510.2796],
    ['JC',          1385.77, 2737.61, 10,   11,   0,  0,  439.7141],
    ['Josaphat',    1306.53, 3447.31, 10,   11,   0,  0,  509.8571],
    ['Juliot',      1827.93, 2329.63, 10.5, 11,   10, 10, 448.19195],
    ['Matisse',     1559.06, 259.87,  10,   10.5, 30, 0,  213.19235],
    ['Patrick',     1312.47, 1978.91, 10,   10.5, 0,  0,  339.03255],
    ['Salemmontin', 1861.1,  1447.91, 10,   11,   20, 0,  365.3801],
    ['kwasi',       2490.33, 1816.29, 10.5, 11,   10, 0,  471.27655],
  ]

  const fiche = (ca1: number, ca2: number, r1: number, r2: number, bonus: number, malus: number) =>
    computePayslip({ ...base, segments: [s1(r1, { ca: ca1 }), s2(r2, { ca: ca2 })], bonus, malus })

  it.each(SHEET)(
    '%s : le taux date retombe sur le total de la feuille',
    (_nom, ca1, ca2, r1, r2, bonus, malus, attendu) => {
      // TOLERANCE 1 CENTIME, et c est une propriete de la FEUILLE, pas du calcul : elle ne borne
      // pas ses decimales (708,8574 EUR), la fiche arrondit chaque composante au centime
      // (spec §4). Le meme ecart maximal de 0,01 EUR se mesure sur les 83 chatteurs a taux
      // constant, qui « tombaient deja au centime » avant cette tache.
      //
      // `Math.abs(...) <= 0.01` et non `toBeCloseTo(_, 2)` : ce dernier tolere 0,005, moitie
      // moins que l ecart d arrondi legitime — il faisait echouer 5 des 12 lignes.
      const net = fiche(ca1, ca2, r1, r2, bonus, malus).net
      expect(Math.abs(net - attendu)).toBeLessThanOrEqual(0.01)
    },
  )

  it('UN SEUL taux sur ces 12 fiches se trompe de 190 EUR (bas) ou 134 EUR (haut)', () => {
    // CE QUI REND LES 12 ASSERTIONS CI-DESSUS DISCRIMINANTES. Le taux unique n est pas « un peu »
    // faux : il sous-paie de 190,12 EUR si on garde l ancien taux sur les 14 jours, et sur-paie
    // de 133,58 EUR si on applique le nouveau — sur 5 172,22 EUR dus. Aucune tolerance de
    // centime ne couvre ca.
    const somme = (f: (r1: number, r2: number) => [number, number]) =>
      Math.round(
        SHEET.reduce((t, [, ca1, ca2, r1, r2, bonus, malus]) => {
          const [a, b] = f(r1, r2)
          return t + fiche(ca1, ca2, a, b, bonus, malus).net
        }, 0) * 100,
      ) / 100
    const feuille = Math.round(SHEET.reduce((t, r) => t + r[7], 0) * 100) / 100
    expect(feuille).toBe(5172.22)
    expect(somme((r1, r2) => [r1, r2])).toBeCloseTo(5172.22, 1) // taux date
    expect(somme((r1) => [r1, r1])).toBe(4982.1) // ancien taux sur 14 jours : -190,12
    expect(somme((_r1, r2) => [r2, r2])).toBe(5305.8) // nouveau taux sur 14 jours : +133,58
  })
})

describe('computePayslip — invariant', () => {
  it('net = base + setter + bonus - malus + handoffs + prime - sanctions + prime setter', () => {
    const r = computePayslip({
      segments: [seg(12.5, { a: 3333.33, b: 1111.11 })],
      fixedAmount: 150, bonus: 50, malus: 20,
      handoffs: 7, primeDue: 100, sanctions: 45, setterPrime: 117.5,
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
    expect(r.setterPrime).toBe(117.5)
    // 555,56 + 150 + 50 - 20 + 4,2 + 100 - 45 = 794,76, puis + 117,5 = 912,26.
    expect(r.net).toBe(912.26)
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
      segments: [seg(10, { a: 1000 })], bonus: 0.004, primeDue: 0.004, handoffs: 7,
      // La prime setter est soumise a la MEME regle que les anciennes composantes : son arrondi
      // doit preceder la somme, sinon elle reintroduit l ecart a elle seule.
      setterPrime: 0.004,
    })
    // Chaque composante sous le centime -> 0,00 : le net ne gagne PAS le centime que la
    // somme brute (100 + 3 x 0,004 + 4,2 = 104,212) ferait apparaitre.
    expect(r.bonus).toBe(0)
    expect(r.prime).toBe(0)
    expect(r.setterPrime).toBe(0)
    expect(r.base).toBe(100)
    expect(r.handoffsAmount).toBe(4.2)
    expect(r.net).toBe(104.2)
  })
})
