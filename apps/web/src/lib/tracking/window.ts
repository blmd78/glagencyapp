import type { TrackerEvent, TrackerRules } from '@glagency/core'
import { normalizeRules } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecture d'une fenêtre de présence — la matière commune aux trois écrans (board, fiche chatteur,
 * managers). Vit en `lib/` et non dans une feature : la frontière ESLint interdit qu'une feature
 * en importe une autre, et ces trois-là consomment exactement la même chose.
 *
 * La RPC `tracker_window` (migration 0126) rend UNE ligne de `jsonb` : la troncature à 1000 lignes
 * de PostgREST ne peut pas mordre, alors qu'une fenêtre de shift dépasse le millier de lignes de
 * focus dès une vingtaine de chatteurs.
 */

interface RawPerson {
  profileId: string
  name: string
  role: 'chatter' | 'manager'
  quotaMinutes: number
  workdays: string
}

interface RawEvent {
  profileId: string
  type: TrackerEvent['type']
  at: string
  receivedAt: string | null
  sessionId: string | null
  meta: Record<string, unknown> | null
}

interface RawFocus {
  profileId: string
  at: string
  kind: 'app' | 'domain'
  label: string
}

interface RawLive {
  profileId: string
  deviceId: string
  state: 'active' | 'pause' | 'idle' | 'off'
  since: string | null
  lastHeartbeatAt: string
  machineId: string | null
  currentModel: string | null
}

interface RawWindow {
  people: RawPerson[]
  events: RawEvent[]
  focus: RawFocus[]
  live: RawLive[]
  rules: Record<string, unknown> | null
}

export interface TrackerPerson extends RawPerson {
  /** Flux prêt pour le domaine : états + focus synthétisés + battement final, TRIÉ par `at`. */
  events: TrackerEvent[]
  live: RawLive | null
}

export interface TrackerWindowData {
  people: TrackerPerson[]
  rules: TrackerRules
}

export async function readTrackerWindow(opts: {
  from: number
  to: number
  profileId?: string
  role?: 'chatter' | 'manager'
}): Promise<TrackerWindowData> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tracker_window', {
    p_from: new Date(opts.from).toISOString(),
    p_to: new Date(opts.to).toISOString(),
    ...(opts.profileId ? { p_profile: opts.profileId } : {}),
    ...(opts.role ? { p_role: opts.role } : {}),
  })
  if (error) throw new Error(error.message)

  // Retour `Returns: Json` → cast documenté vers le contrat local, comme `bilan_report`
  // (cf. docs/guidelines-data-loading.md §1 : ni `as never`, ni `.overrideTypes`).
  const raw = (data as RawWindow | null) ?? { people: [], events: [], focus: [], live: [], rules: null }

  const eventsBy = groupBy(raw.events, (e) => e.profileId)
  const focusBy = groupBy(raw.focus, (f) => f.profileId)
  const liveBy = new Map(raw.live.map((l) => [l.profileId, l]))

  const people = raw.people.map((p) => {
    const live = liveBy.get(p.profileId) ?? null
    return {
      ...p,
      live,
      events: buildStream(eventsBy.get(p.profileId) ?? [], focusBy.get(p.profileId) ?? [], live),
    }
  })

  return { people, rules: normalizeRules(mapRules(raw.rules)) }
}

/**
 * Assemble le flux que `@glagency/core` attend, à partir de trois tables séparées.
 *
 * Deux synthèses, toutes deux imposées par le schéma (§3.3 de la spec) :
 *
 * 1. **Le focus** n'est pas un événement stocké — il vit dans `tracker_focus_raw`. On le remet en
 *    événements `focus` avec le `meta` que le domaine attend (`host` pour un domaine, `app` pour
 *    une application).
 * 2. **Le battement final** vient de `tracker_live.last_heartbeat_at`. Les `heartbeat` ne sont pas
 *    stockés ; sans cette ligne, `buildSegments` voit TOUT shift en cours comme planté et rend
 *    zéro minute. C'est la précondition écrite noir sur blanc dans son en-tête.
 *
 * Le tri final n'est pas cosmétique : `buildSegments` exige des événements croissants, sinon sa
 * normalisation d'horloge redate un événement en retard sur le précédent.
 */
function buildStream(events: RawEvent[], focus: RawFocus[], live: RawLive | null): TrackerEvent[] {
  const out: TrackerEvent[] = events.map((e) => ({
    type: e.type,
    at: e.at,
    receivedAt: e.receivedAt,
    sessionId: e.sessionId,
    meta: e.meta,
  }))

  for (const f of focus) {
    out.push({
      type: 'focus',
      at: f.at,
      receivedAt: f.at,
      meta: f.kind === 'domain' ? { host: f.label } : { app: f.label },
    })
  }

  if (live) {
    out.push({ type: 'heartbeat', at: live.lastHeartbeatAt, receivedAt: live.lastHeartbeatAt })
  }

  return out.sort((a, b) => a.at.localeCompare(b.at))
}

/** `tracker_rules` (snake_case en base) → `RawRules` (camelCase, contrat du domaine). */
function mapRules(r: Record<string, unknown> | null) {
  if (!r) return {}
  return {
    offTaskThresholdMinutes: r.off_task_threshold_minutes as number,
    stagnantThresholdMinutes: r.stagnant_threshold_minutes as number,
    mainTool: r.main_tool as string,
    toolMinMinutes: r.tool_min_minutes as number,
    latenessMaxMinutes: r.lateness_max_minutes as number,
    apps: r.apps as string[],
    domains: r.domains as string[],
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = out.get(k)
    if (bucket) bucket.push(row)
    else out.set(k, [row])
  }
  return out
}
