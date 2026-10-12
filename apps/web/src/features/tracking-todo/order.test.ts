import { describe, expect, it } from 'vitest'
import { arrivalIndex, habitKey, placeAt, sortSlots, STEP, type Slot } from './order'
import type { Urgency } from './urgency'

const real = (id: string, key: number, tie = id, urgency: Urgency = 'normale'): Slot => ({
  id,
  key,
  tie,
  fixed: false,
  urgency,
})
const habit = (id: string, position: number): Slot => ({ id, key: habitKey(position), tie: '', fixed: true, urgency: 'normale' })

/** Applique `placeAt` comme le ferait le serveur, et rend l'ordre obtenu. */
const apply = (sorted: Slot[], index: number, id = 'new'): string[] => {
  const r = placeAt(sorted, index)
  if (!r) throw new Error('pas de place')
  const keyed = sorted.map((s) => ({ ...s, key: r.moves.find((m) => m.id === s.id)?.key ?? s.key }))
  return sortSlots([...keyed, { id, key: r.key, tie: 'zzz', fixed: false, urgency: 'normale' as const }]).map((s) => s.id)
}

describe('sortSlots', () => {
  it('les lignes d’avant #161 (toutes à 0) gardent l’ordre de création', () => {
    const s = sortSlots([real('b', 0, '2026-10-02'), real('a', 0, '2026-10-01'), real('c', 0, '2026-10-03')])
    expect(s.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('les habitudes passent en haut, dans leur ordre', () => {
    const s = sortSlots([real('t', 0), habit('h2', 1), habit('h1', 0)])
    expect(s.map((x) => x.id)).toEqual(['h1', 'h2', 't'])
  })
})

describe('arrivalIndex — l’urgence décide de la place d’arrivée', () => {
  const sec = [real('u1', 0, 'a', 'urgente'), real('u2', 1, 'b', 'urgente'), real('n', 2, 'c', 'normale')]

  it('urgente : tout en haut', () => expect(arrivalIndex(sec, 'urgente')).toBe(0))
  it('importante : sous les urgentes', () => expect(arrivalIndex(sec, 'importante')).toBe(2))
  it('normale : en bas', () => expect(arrivalIndex(sec, 'normale')).toBe(3))
  it('importante sans urgente : en haut', () => expect(arrivalIndex([real('n', 0)], 'importante')).toBe(0))
})

describe('placeAt', () => {
  it('section vide : clé 0', () => expect(placeAt([], 0)).toEqual({ key: 0, moves: [] }))

  it('en tête et en queue : un pas au-delà, sans rien réécrire', () => {
    const s = [real('a', 0), real('b', STEP)]
    expect(placeAt(s, 0)).toEqual({ key: -STEP, moves: [] })
    expect(placeAt(s, 2)).toEqual({ key: 2 * STEP, moves: [] })
  })

  it('entre deux clés espacées : le milieu, sans rien réécrire', () => {
    expect(placeAt([real('a', 0), real('b', STEP)], 1)).toEqual({ key: STEP / 2, moves: [] })
  })

  it('entre deux lignes d’avant #161 (clés égales) : renumérote, l’ordre est respecté', () => {
    const s = sortSlots([real('a', 0, '1'), real('b', 0, '2'), real('c', 0, '3')])
    expect(apply(s, 1)).toEqual(['a', 'new', 'b', 'c'])
    expect(apply(s, 2)).toEqual(['a', 'b', 'new', 'c'])
  })

  it('ne renumérote JAMAIS une occurrence virtuelle (pas de ligne où écrire)', () => {
    const s = sortSlots([habit('h1', 0), real('a', 0, '1'), real('b', 0, '2')])
    const r = placeAt(s, 2)
    expect(r?.moves.some((m) => m.id === 'h1')).toBe(false)
    expect(apply(s, 2)).toEqual(['h1', 'a', 'new', 'b'])
  })

  it('poser une tâche entre deux habitudes reste possible', () => {
    const s = sortSlots([habit('h1', 0), habit('h2', 1)])
    expect(apply(s, 1)).toEqual(['h1', 'new', 'h2'])
  })

  it('passer AU-DESSUS des habitudes (une urgente en tête de journée)', () => {
    const s = sortSlots([habit('h1', 0), real('a', 0)])
    expect(apply(s, 0)).toEqual(['new', 'h1', 'a'])
  })

  it('renuméroter sous les habitudes repart des clés positives (une habitude créée plus tard reste en haut)', () => {
    const s = sortSlots([habit('h1', 0), real('a', 0, '1'), real('b', 0, '2')])
    const r = placeAt(s, 2)
    expect(r && [r.key, ...r.moves.map((m) => m.key)].every((k) => k >= 0)).toBe(true)
  })

  it('renuméroter entre deux habitudes reste dans leurs bornes', () => {
    // Deux lignes collées entre h1 et h2, puis une troisième glissée entre elles.
    const k = habitKey(0) + 1
    const s = sortSlots([habit('h1', 0), real('a', k, '1'), real('b', k, '2'), habit('h2', 1)])
    expect(apply(s, 2)).toEqual(['h1', 'a', 'new', 'b', 'h2'])
  })
})
