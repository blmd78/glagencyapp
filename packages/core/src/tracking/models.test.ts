import { describe, expect, it } from 'vitest'
import { attributeModels, modelKey } from './models'
import { buildSegments } from './segments'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const at = (offsetMin: number): string => new Date(T0 + min(offsetMin)).toISOString()

describe('modelKey', () => {
  it('insensible à la casse et aux espaces multiples', () => {
    expect(modelKey('  CARLA   Rose ')).toBe('carla rose')
    expect(modelKey('carla')).toBe(modelKey('CARLA'))
  })
})

describe('attributeModels', () => {
  it('répartit le temps actif entre les modèles, le principal en tête', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'model', at: at(40), meta: { model: 'LEA' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([
      { model: 'CARLA', minutes: 40 },
      { model: 'LEA', minutes: 20 },
    ])
    expect(r.main).toBe('CARLA')
    expect(r.untrackedMinutes).toBe(0)
  })

  it('le temps actif avant tout choix de modèle est « non attribué »', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(20), meta: { model: 'CARLA' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([{ model: 'CARLA', minutes: 40 }])
    expect(r.untrackedMinutes).toBe(20)
  })

  it("la pause n'est attribuée à aucun modèle", () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'pause', at: at(20) },
      { type: 'resume', at: at(50) },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([{ model: 'CARLA', minutes: 30 }])
  })

  it('fenêtre qui COUPE le segment : seule la portion dans la fenêtre est attribuée', () => {
    // Sans clipping, on rendrait CARLA 40 / LEA 20 comme sur la fenêtre pleine.
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'model', at: at(40), meta: { model: 'LEA' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0 + min(20), T0 + min(50))
    expect(r.perModel).toEqual([
      { model: 'CARLA', minutes: 20 },
      { model: 'LEA', minutes: 10 },
    ])
    expect(r.untrackedMinutes).toBe(0)
  })

  it('sans aucun event model : rien attribué, tout non attribué', () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    expect(r.perModel).toEqual([])
    expect(r.main).toBeNull()
    expect(r.untrackedMinutes).toBe(60)
  })

  it("un retour sur le même modèle s'additionne sous une seule entrée", () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'model', at: at(20), meta: { model: 'LEA' } },
      { type: 'model', at: at(40), meta: { model: 'CARLA' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    // Sans accumulation, on aurait 3 entrées (20 + 20 + 20).
    expect(r.perModel).toEqual([
      { model: 'CARLA', minutes: 40 },
      { model: 'LEA', minutes: 20 },
    ])
    expect(r.main).toBe('CARLA')
  })

  it("la casse ne crée pas deux modèles : « CARLA » et « carla » n'en font qu'un", () => {
    const events: TrackerEvent[] = [
      { type: 'shift_start', at: at(0) },
      { type: 'model', at: at(0), meta: { model: 'CARLA' } },
      { type: 'model', at: at(30), meta: { model: 'carla' } },
      { type: 'shift_end', at: at(60) },
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const r = attributeModels(built, events, T0, T0 + min(120))
    // Le premier libellé rencontré fait foi pour l'affichage.
    expect(r.perModel).toEqual([{ model: 'CARLA', minutes: 60 }])
  })
})
