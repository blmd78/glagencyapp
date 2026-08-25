import type { BuiltSegments, TrackerEvent } from './types'

/**
 * Attribution du temps ACTIF par modèle.
 *
 * L'app envoie un événement `model` à chaque changement de modèle. Chaque choix vaut jusqu'au
 * suivant. Comme pour les apps, seul le temps ACTIF est attribué.
 */

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): number =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))

/** Clé de dédoublonnage d'un nom de modèle : « CARLA » et « carla » sont le même modèle. */
export const modelKey = (name: string): string =>
  String(name).trim().toLowerCase().replace(/\s+/g, ' ')

interface Interval {
  start: number
  end: number
  model: string
}

function buildIntervals(events: TrackerEvent[]): Interval[] {
  const points: { t: number; model: string }[] = []
  let last = -Infinity
  for (const e of events) {
    if (e.type !== 'model') continue
    const t = Math.max(Date.parse(e.at), last)
    if (!Number.isFinite(t)) continue
    last = t
    const model = e.meta?.model
    if (typeof model === 'string' && model.trim()) points.push({ t, model: model.trim() })
  }
  return points.map((p, i) => ({
    start: p.t,
    end: i + 1 < points.length ? (points[i + 1] as { t: number }).t : Infinity,
    model: p.model,
  }))
}

export interface ModelTime {
  model: string
  minutes: number
}

export interface ModelAttribution {
  perModel: ModelTime[]
  /** Le modèle sur lequel le chatter a passé le plus de temps. */
  main: string | null
  untrackedMinutes: number
}

export function attributeModels(
  built: BuiltSegments,
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
): ModelAttribution {
  const active = built.segments.filter((s) => s.kind === 'active')
  const intervals = buildIntervals(events)
  const byModel = new Map<string, number>()
  let attributed = 0

  for (const seg of active) {
    const s = Math.max(seg.start, windowStart)
    const e = Math.min(seg.end, windowEnd)
    if (e <= s) continue
    for (const iv of intervals) {
      const ms = overlap(s, e, iv.start, iv.end)
      if (ms <= 0) continue
      byModel.set(iv.model, (byModel.get(iv.model) ?? 0) + ms)
      attributed += ms
    }
  }

  const activeMs = active.reduce((n, s) => n + overlap(s.start, s.end, windowStart, windowEnd), 0)

  const perModel = [...byModel.entries()]
    .map(([model, ms]) => ({ model, minutes: Math.round(ms / 60_000) }))
    .filter((m) => m.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  return {
    perModel,
    main: perModel[0]?.model ?? null,
    untrackedMinutes: Math.round(Math.max(0, activeMs - attributed) / 60_000),
  }
}
