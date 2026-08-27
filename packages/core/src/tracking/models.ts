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
  // Regroupement par CLÉ normalisée — « CARLA » et « carla » sont le MÊME modèle — en gardant le
  // premier libellé rencontré pour l'affichage. Sans ça, une simple différence de casse scinde un
  // modèle en deux lignes et peut faire élire le mauvais `main`.
  const byModel = new Map<string, { label: string; ms: number }>()
  let attributed = 0

  for (const seg of active) {
    const s = Math.max(seg.start, windowStart)
    const e = Math.min(seg.end, windowEnd)
    if (e <= s) continue
    for (const iv of intervals) {
      const ms = overlap(s, e, iv.start, iv.end)
      if (ms <= 0) continue
      const key = modelKey(iv.model)
      const rec = byModel.get(key) ?? { label: iv.model, ms: 0 }
      rec.ms += ms
      byModel.set(key, rec)
      attributed += ms
    }
  }

  const activeMs = active.reduce((n, s) => n + overlap(s.start, s.end, windowStart, windowEnd), 0)

  const perModel = [...byModel.values()]
    .map((r) => ({ model: r.label, minutes: Math.round(r.ms / 60_000) }))
    .filter((m) => m.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  return {
    perModel,
    main: perModel[0]?.model ?? null,
    untrackedMinutes: Math.round(Math.max(0, activeMs - attributed) / 60_000),
  }
}
