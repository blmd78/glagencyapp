import { describe, expect, it } from 'vitest'
import { rankSetters, type SetterScaleRow } from './setter-rank'

/** Le barème de juin, amorce de `compta_setter_scale` (migration 0090). Σ = 1796 €. */
const SCALE: SetterScaleRow[] = [
  200, 175, 165, 140, 130, 120, 115, 110, 105, 100, 95, 90, 87, 84, 80,
].map((amount, i) => ({ rank: i + 1, amount }))

const SCALE_TOTAL = 1796

const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0)
const byId = (rows: { id: string }[]) => Object.fromEntries(rows.map((r) => [r.id, r]))

describe('rankSetters — sans ex aequo', () => {
  it('classe par handoffs decroissants et verse la tranche du rang', () => {
    const r = rankSetters({ b: 50, a: 90, c: 10 }, SCALE)
    expect(r).toEqual([
      { id: 'a', handoffs: 90, rank: 1, amount: 200 },
      { id: 'b', handoffs: 50, rank: 2, amount: 175 },
      { id: 'c', handoffs: 10, rank: 3, amount: 165 },
    ])
  })

  it('moins de 15 setters : les tranches basses ne sont pas versees', () => {
    const r = rankSetters({ a: 90, b: 50, c: 10 }, SCALE)
    // 540 = 200 + 175 + 165. Le reste du bareme (1256 EUR) n'est du a personne : une population
    // courte ne fait pas remonter la 15e tranche vers quelqu'un.
    expect(total(r)).toBe(540)
    expect(r).toHaveLength(3)
  })
})

describe('rankSetters — ex aequo', () => {
  // LES DEUX PAIRES DE JUIN, telles qu'observees sur la feuille du proprietaire : Andria et
  // Martin a 71 handoffs (tranches 6 et 7 : 120 + 115), Erielly et Andre a 66 (tranches 9 et
  // 10 : 105 + 100). Les rangs voisins sont reconstruits pour les placer exactement la.
  const juin = {
    m01: 120, m02: 110, m03: 100, m04: 90, m05: 80,
    andria: 71, martin: 71,
    m08: 70,
    erielly: 66, andre: 66,
    m11: 60, m12: 55, m13: 50, m14: 45, m15: 40,
  }

  it('partagent le rang, et la somme des tranches qu ils occupent', () => {
    const r = byId(rankSetters(juin, SCALE))
    // (120 + 115) / 2 — et non 120 aux deux (le plan le suggerait : +5 EUR verses en trop, et la
    // tranche 7 jamais payee), ni 120/115 departages par le nom ou l'identifiant.
    expect(r.andria).toEqual({ id: 'andria', handoffs: 71, rank: 6, amount: 117.5 })
    expect(r.martin).toEqual({ id: 'martin', handoffs: 71, rank: 6, amount: 117.5 })
    // (105 + 100) / 2.
    expect(r.erielly).toEqual({ id: 'erielly', handoffs: 66, rank: 9, amount: 102.5 })
    expect(r.andre).toEqual({ id: 'andre', handoffs: 66, rank: 9, amount: 102.5 })
  })

  it('le rang suivant SAUTE d autant (classement competition)', () => {
    const r = byId(rankSetters(juin, SCALE))
    // Deux rangs 6 -> le suivant est 8, pas 7 ; deux rangs 9 -> le suivant est 11.
    expect(r.m08).toEqual({ id: 'm08', handoffs: 70, rank: 8, amount: 110 })
    expect(r.m11).toEqual({ id: 'm11', handoffs: 60, rank: 11, amount: 95 })
  })

  it('le TOTAL verse est celui du bareme — les ex aequo ne le font pas deriver', () => {
    // C'est LA propriete que la mise en commun protege : 15 tranches, depensees une fois. La
    // somme payee par le proprietaire en juin sur ces deux paires (235 et 205) est identique.
    expect(total(rankSetters(juin, SCALE))).toBe(SCALE_TOTAL)
  })

  it('trois ex aequo : division a parts egales, arrondie au centime', () => {
    // Bareme reduit a une seule tranche : la cagnotte vaut 100 + 0 + 0 (tranches 2 et 3 absentes).
    const r = rankSetters({ a: 5, b: 5, c: 5 }, [{ rank: 1, amount: 100 }])
    expect(r.map((x) => x.amount)).toEqual([33.33, 33.33, 33.33])
    // 99,99 distribue au lieu de 100 : l'ecart d'arrondi est borne a moins d'un centime par
    // personne, et il est assume (cf. `setter-rank.ts`).
    expect(total(r)).toBeCloseTo(99.99, 2)
  })
})

describe('rankSetters — bareme incomplet', () => {
  it('au-dela du bareme, la prime vaut 0 et le membre reste classe', () => {
    const r = rankSetters({ a: 30, b: 20, c: 10 }, [
      { rank: 1, amount: 200 },
      { rank: 2, amount: 175 },
    ])
    // `c` est bien CLASSE 3e — l'ecran doit pouvoir montrer un classement complet ; il touche 0.
    expect(r[2]).toEqual({ id: 'c', handoffs: 10, rank: 3, amount: 0 })
  })

  it('un rang manquant vaut 0, sans erreur', () => {
    const troue: SetterScaleRow[] = [
      { rank: 1, amount: 200 },
      { rank: 3, amount: 165 },
    ]
    expect(rankSetters({ a: 30, b: 20, c: 10 }, troue).map((x) => x.amount)).toEqual([200, 0, 165])
    // Ex aequo A CHEVAL sur le trou : la cagnotte ne compte que ce qui existe (200 + 0).
    expect(rankSetters({ a: 30, b: 30 }, troue).map((x) => x.amount)).toEqual([100, 100])
  })

  it('un bareme vide ne verse rien mais classe quand meme', () => {
    expect(rankSetters({ a: 30, b: 20 }, [])).toEqual([
      { id: 'a', handoffs: 30, rank: 1, amount: 0 },
      { id: 'b', handoffs: 20, rank: 2, amount: 0 },
    ])
  })
})

describe('rankSetters — population', () => {
  it('un membre sans aucun handoff n est pas classe', () => {
    // Sinon, avec 15 tranches et 3 setters actifs, quelqu'un a 0 handoff toucherait 140 EUR.
    const r = rankSetters({ a: 30, zero: 0, negatif: -3 }, SCALE)
    expect(r.map((x) => x.id)).toEqual(['a'])
  })

  it('une population vide rend un tableau vide', () => {
    expect(rankSetters({}, SCALE)).toEqual([])
  })
})

describe('rankSetters — determinisme', () => {
  it('l ordre des entrees ne change RIEN au resultat, pas meme l ordre des lignes', () => {
    // `Array.prototype.sort` est STABLE : un tri par handoffs seul aurait conserve l'ordre
    // d'insertion entre ex aequo, et la prime aurait dependu de l'ordre des lignes rendues par
    // Postgres. Ici les deux ordres d'entree donnent le meme tableau, cle par cle.
    const croissant = rankSetters({ a: 10, b: 10, c: 10, d: 5 }, SCALE)
    const decroissant = rankSetters({ d: 5, c: 10, b: 10, a: 10 }, SCALE)
    expect(decroissant).toEqual(croissant)
    // Et le contenu est bien celui attendu : (200 + 175 + 165) / 3 = 180 chacun, puis rang 4.
    expect(croissant).toEqual([
      { id: 'a', handoffs: 10, rank: 1, amount: 180 },
      { id: 'b', handoffs: 10, rank: 1, amount: 180 },
      { id: 'c', handoffs: 10, rank: 1, amount: 180 },
      { id: 'd', handoffs: 5, rank: 4, amount: 140 },
    ])
  })
})
