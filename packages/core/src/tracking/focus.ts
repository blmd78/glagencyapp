import { isAllowedApp, isAllowedDomain, type TrackerRules } from './rules'
import type { BuiltSegments, TrackerEvent } from './types'

/**
 * Attribution du temps ACTIF par application / domaine.
 *
 * Chaque `focus` vaut jusqu'au `focus` suivant. On croise ces intervalles avec les segments ACTIFS
 * seulement : le temps en pause, inactif ou hors shift n'est jamais attribué. Le temps actif sans
 * donnée de fenêtre reste « inconnu » et n'est JAMAIS compté comme hors tâche — on ne pénalise
 * jamais sur une incertitude.
 */

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number): number =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))

/** Normalise une URL brute en { host, path } ; `null` si inexploitable. */
export function normalizeUrl(raw: string | null | undefined): { host: string; path: string } | null {
  if (!raw) return null
  let s = String(raw).trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if (!['http:', 'https:'].includes(u.protocol)) return null
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (!host.includes('.')) return null
    // On jette query et fragment : ils peuvent contenir des jetons de session.
    return { host, path: u.pathname && u.pathname !== '/' ? u.pathname : '' }
  } catch {
    return null
  }
}

interface Interval {
  start: number
  end: number
  app: string | null
  host: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

function buildIntervals(events: TrackerEvent[]): Interval[] {
  const points: { t: number; app: string | null; host: string | null }[] = []
  let last = -Infinity
  for (const e of events) {
    if (e.type !== 'focus') continue
    const t = Math.max(Date.parse(e.at), last)
    if (!Number.isFinite(t)) continue
    last = t
    points.push({ t, app: str(e.meta?.app), host: str(e.meta?.host) })
  }
  return points.map((p, i) => ({
    start: p.t,
    end: i + 1 < points.length ? (points[i + 1] as { t: number }).t : Infinity,
    app: p.app,
    host: p.host,
  }))
}

interface Key {
  id: string
  label: string
  kind: 'app' | 'domain'
  host: string | null
  app: string | null
}

function keyOf(iv: Interval): Key | null {
  if (iv.host) return { id: `d:${iv.host}`, label: iv.host, kind: 'domain', host: iv.host, app: null }
  if (iv.app) return { id: `a:${iv.app.toLowerCase()}`, label: iv.app, kind: 'app', host: null, app: iv.app }
  return null
}

export interface AppItem {
  label: string
  kind: 'app' | 'domain'
  minutes: number
  allowed: boolean
}

export interface AppAttribution {
  items: AppItem[]
  offTask: AppItem[]
  offTaskMinutes: number
  trackedMinutes: number
}

export function attributeApps(
  built: BuiltSegments,
  events: TrackerEvent[],
  windowStart: number,
  windowEnd: number,
  rules: TrackerRules,
): AppAttribution {
  const active = built.segments.filter((s) => s.kind === 'active')
  const intervals = buildIntervals(events)
  const byKey = new Map<string, Key & { ms: number }>()

  for (const seg of active) {
    const s = Math.max(seg.start, windowStart)
    const e = Math.min(seg.end, windowEnd)
    if (e <= s) continue
    for (const iv of intervals) {
      const ms = overlap(s, e, iv.start, iv.end)
      if (ms <= 0) continue
      const key = keyOf(iv)
      if (!key) continue
      const rec = byKey.get(key.id) ?? { ...key, ms: 0 }
      rec.ms += ms
      byKey.set(key.id, rec)
    }
  }

  const items: AppItem[] = [...byKey.values()]
    .map((r) => ({
      label: r.label,
      kind: r.kind,
      minutes: Math.round(r.ms / 60_000),
      allowed: r.kind === 'domain' ? isAllowedDomain(r.host as string, rules) : isAllowedApp(r.app as string, rules),
    }))
    .filter((i) => i.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)

  const offTask = items.filter((i) => !i.allowed)
  return {
    items,
    offTask,
    offTaskMinutes: offTask.reduce((n, i) => n + i.minutes, 0),
    trackedMinutes: items.reduce((n, i) => n + i.minutes, 0),
  }
}
