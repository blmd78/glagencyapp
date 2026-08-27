import { DEFAULT_STALE_MS, buildSegments } from './segments'
import type { TrackerEvent } from './types'

/**
 * Répartition du temps actif par POSTE.
 *
 * Changer d'ordinateur est légitime : on le signale comme une information (« changement de poste à
 * 14h20 »), pas comme une faute. Ce qui mérite une alerte, c'est deux postes actifs EN MÊME TEMPS —
 * là, le temps est compté deux fois, et le total juste est l'union, pas la somme.
 */

export const OVERLAP_ALERT_MINUTES = 10

type Interval = [number, number]

const clip = (iv: Interval[], start: number, end: number): Interval[] =>
  iv
    .map(([s, e]): Interval => [Math.max(s, start), Math.min(e, end)])
    .filter(([s, e]) => e > s)

const total = (iv: Interval[]): number =>
  Math.round(iv.reduce((t, [s, e]) => t + (e - s), 0) / 60_000)

function unionOf(lists: Interval[][]): Interval[] {
  const all = lists.flat().sort((a, b) => a[0] - b[0])
  const merged: Interval[] = []
  for (const cur of all) {
    const last = merged[merged.length - 1]
    if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1])
    else merged.push([cur[0], cur[1]])
  }
  return merged
}

function overlapOf(a: Interval[], b: Interval[]): { minutes: number; parts: Interval[] } {
  let ms = 0
  const parts: Interval[] = []
  for (const [s1, e1] of a) {
    for (const [s2, e2] of b) {
      const o = Math.min(e1, e2) - Math.max(s1, s2)
      if (o > 0) {
        ms += o
        parts.push([Math.max(s1, s2), Math.min(e1, e2)])
      }
    }
  }
  return { minutes: Math.round(ms / 60_000), parts }
}

export interface MachineSlice {
  id: string | null
  label: string
  minutes: number
  from: number
  to: number
  intervals: Interval[]
}

export interface MachineBreakdown {
  machines: MachineSlice[]
  multi: boolean
  switches: { at: number; from: string; to: string }[]
  overlapMinutes: number
  overlapParts: Interval[]
  unionMinutes: number
}

export function machineBreakdown(
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
  now: number = Date.now(),
  staleMs: number = DEFAULT_STALE_MS,
): MachineBreakdown {
  const groups = new Map<string | null, TrackerEvent[]>()
  for (const e of events) {
    const k = e.machineId ?? null
    const bucket = groups.get(k)
    if (bucket) bucket.push(e)
    else groups.set(k, [e])
  }

  const machines: MachineSlice[] = []
  for (const [id, evs] of groups) {
    const intervals = clip(
      buildSegments(evs, { now, staleMs }).segments
        .filter((s) => s.kind === 'active')
        .map((s): Interval => [s.start, s.end]),
      windowStart,
      windowEnd,
    )
    if (!intervals.length) continue
    const first = intervals[0] as Interval
    const last = intervals[intervals.length - 1] as Interval
    machines.push({ id, label: '', minutes: total(intervals), from: first[0], to: last[1], intervals })
  }

  // Numérotés dans l'ordre d'apparition : « Poste 1 », « Poste 2 »…
  machines.sort((a, b) => a.from - b.from)
  machines.forEach((m, i) => { m.label = `Poste ${i + 1}` })

  // L'app n'envoyait pas d'identifiant avant la 1.0.3 : un seul groupe sans id n'est pas un
  // « poste », c'est juste de l'historique. On ne signale rien.
  const known = machines.filter((m) => m.id)
  if (machines.length < 2 || known.length < 2) {
    return {
      machines,
      multi: false,
      switches: [],
      overlapMinutes: 0,
      overlapParts: [],
      unionMinutes: total(machines.flatMap((m) => m.intervals)),
    }
  }

  let overlapMinutes = 0
  const overlapParts: Interval[] = []
  for (let i = 0; i < machines.length; i++) {
    for (let j = i + 1; j < machines.length; j++) {
      const o = overlapOf((machines[i] as MachineSlice).intervals, (machines[j] as MachineSlice).intervals)
      overlapMinutes += o.minutes
      overlapParts.push(...o.parts)
    }
  }

  const timeline = machines
    .flatMap((m) => m.intervals.map(([s, e]) => ({ s, e, label: m.label })))
    .sort((a, b) => a.s - b.s)
  const switches: { at: number; from: string; to: string }[] = []
  for (let i = 1; i < timeline.length; i++) {
    const cur = timeline[i] as { s: number; label: string }
    const prev = timeline[i - 1] as { label: string }
    if (cur.label !== prev.label) switches.push({ at: cur.s, from: prev.label, to: cur.label })
  }

  return {
    machines,
    multi: true,
    switches,
    overlapMinutes,
    overlapParts,
    unionMinutes: total(unionOf(machines.map((m) => m.intervals))),
  }
}
