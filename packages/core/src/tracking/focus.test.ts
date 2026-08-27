import { describe, expect, it } from 'vitest'
import { buildSegments } from './segments'
import { attributeApps, normalizeUrl } from './focus'
import { isAllowedDomain, normalizeRules } from './rules'
import type { TrackerEvent } from './types'

const T0 = Date.parse('2026-08-25T07:00:00Z')
const min = (n: number): number => n * 60_000
const rules = normalizeRules({ apps: ['chrome', 'discord'], domains: ['mypuls.app', 'onlyfans.com'] })

const focus = (offsetMin: number, meta: Record<string, unknown>): TrackerEvent => ({
  type: 'focus',
  at: new Date(T0 + min(offsetMin)).toISOString(),
  meta,
})
const state = (type: TrackerEvent['type'], offsetMin: number): TrackerEvent => ({
  type,
  at: new Date(T0 + min(offsetMin)).toISOString(),
})

describe('normalizeUrl', () => {
  it('extrait hôte et chemin, jette query et fragment', () => {
    expect(normalizeUrl('https://www.MyPuls.app/chat/42?token=secret#x')).toEqual({
      host: 'mypuls.app',
      path: '/chat/42',
    })
  })
  it('accepte une URL sans protocole', () => {
    expect(normalizeUrl('onlyfans.com/foo')?.host).toBe('onlyfans.com')
  })
  it('rejette ce qui n’est pas exploitable', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl(null)).toBeNull()
    expect(normalizeUrl('file:///C:/secret.txt')).toBeNull()
    expect(normalizeUrl('localhost')).toBeNull()   // pas de point → pas un hôte
  })
})

describe('isAllowedDomain', () => {
  it('accepte un sous-domaine d’un domaine autorisé', () => {
    expect(isAllowedDomain('app.mypuls.app', rules)).toBe(true)
    expect(isAllowedDomain('mypuls.app', rules)).toBe(true)
  })
  it('refuse un domaine qui se termine par le même texte sans en être un sous-domaine', () => {
    expect(isAllowedDomain('notmypuls.app', rules)).toBe(false)
    expect(isAllowedDomain('youtube.com', rules)).toBe(false)
  })
})

describe('attributeApps', () => {
  it('n’attribue que le temps ACTIF', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'mypuls.app' }),
      state('pause', 30),
      focus(30, { app: 'chrome', host: 'youtube.com' }),  // pendant la pause : non attribué
      state('resume', 50),
      focus(50, { app: 'chrome', host: 'youtube.com' }),
      state('shift_end', 60),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    const byLabel = Object.fromEntries(a.items.map((i) => [i.label, i.minutes]))
    expect(byLabel['mypuls.app']).toBe(30)
    expect(byLabel['youtube.com']).toBe(10)   // 50→60 seulement, pas 30→50 (en pause)
    expect(a.offTaskMinutes).toBe(10)
    expect(a.trackedMinutes).toBe(40)
  })

  it('le temps actif SANS donnée de fenêtre reste inconnu, jamais hors tâche', () => {
    const events: TrackerEvent[] = [state('shift_start', 0), state('shift_end', 60)]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    expect(a.items).toHaveLength(0)
    expect(a.offTaskMinutes).toBe(0)
    expect(a.trackedMinutes).toBe(0)
  })

  it('retombe sur l’app quand l’hôte est illisible', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'discord' }),
      state('shift_end', 20),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    expect(a.items[0]).toMatchObject({ label: 'discord', kind: 'app', allowed: true, minutes: 20 })
  })

  it('deux plages actives du MÊME label sont additionnées sous une seule entrée', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'mypuls.app' }),
      focus(10, { app: 'chrome', host: 'youtube.com' }),
      focus(20, { app: 'chrome', host: 'mypuls.app' }),
      state('shift_end', 40),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(40), rules)
    // Sans regroupement par clé, on aurait 3 entrées (10 + 10 + 20) au lieu de 2.
    expect(a.items).toHaveLength(2)
    const byLabel = Object.fromEntries(a.items.map((i) => [i.label, i.minutes]))
    expect(byLabel['mypuls.app']).toBe(30)
    expect(byLabel['youtube.com']).toBe(10)
  })

  it('fenêtre qui COUPE les segments : seule la portion dans la fenêtre est attribuée', () => {
    // Sans clipping, une implémentation qui attribue le segment entier rendrait 30 et 10.
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'mypuls.app' }),
      state('pause', 30),
      state('resume', 50),
      focus(50, { app: 'chrome', host: 'youtube.com' }),
      state('shift_end', 60),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0 + min(15), T0 + min(55), rules)
    const byLabel = Object.fromEntries(a.items.map((i) => [i.label, i.minutes]))
    expect(byLabel['mypuls.app']).toBe(15)   // actif [15,30] seulement
    expect(byLabel['youtube.com']).toBe(5)   // actif [50,55] seulement
    expect(a.trackedMinutes).toBe(20)
  })

  it('trie par minutes décroissantes', () => {
    const events: TrackerEvent[] = [
      state('shift_start', 0),
      focus(0, { app: 'chrome', host: 'youtube.com' }),
      focus(5, { app: 'chrome', host: 'mypuls.app' }),
      state('shift_end', 60),
    ]
    const built = buildSegments(events, { now: T0 + min(120) })
    const a = attributeApps(built, events, T0, T0 + min(120), rules)
    expect(a.items.map((i) => i.label)).toEqual(['mypuls.app', 'youtube.com'])
  })
})
