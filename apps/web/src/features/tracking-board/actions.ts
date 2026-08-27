'use server'

import { computeWindowVerdict, shiftByKey, shiftWindowOn, type Shift, type TrackerEvent } from '@glagency/core'
import { requireAccess } from '@/lib/auth'
import { readTrackerWindow } from '@/lib/tracking/window'
import type { RowDetail, TimelineRow } from './types'

const EMPTY: RowDetail = {
  sites: [],
  untrackedMinutes: 0,
  stats: { activeMinutes: 0, pauseMinutes: 0, idleMinutes: 0, toolMinutes: 0, startedAtMs: null },
  timeline: [],
}

/**
 * Contenu déplié d'une ligne du board : sites, statistiques, timeline.
 *
 * Chargé À LA DEMANDE, au premier dépliage. C'est le seul écart volontaire au rendu d'origine :
 * leur board inline ce détail pour les 97 chatteurs, lu ou pas — 400 Ko de HTML dont 1144 lignes
 * de timeline. Ici la page part légère et ne paie que ce qu'on ouvre.
 *
 * Lecture seule, donc pas de `runAction` : c'est un point de lecture ciblé, pas une mutation. En
 * revanche la garde d'accès est REFAITE — une Server Action est un point d'entrée public, jamais
 * couvert par la garde de la page qui l'a rendue.
 */
export async function getRowDetail(input: {
  profileId: string
  shiftKey: string
  date: string
}): Promise<RowDetail> {
  await requireAccess('presence')

  const shift = (shiftByKey(input.shiftKey) ?? shiftByKey('aprem')) as Shift
  const win = shiftWindowOn(shift, input.date)
  const now = Date.now()

  const { people, rules } = await readTrackerWindow({
    from: win.start,
    to: win.end,
    profileId: input.profileId,
  })
  const person = people[0]
  if (!person) return EMPTY

  const verdict = computeWindowVerdict({
    events: person.events,
    windowStart: win.start,
    windowEnd: win.end,
    queryDate: win.date,
    quotaMinutes: person.quotaMinutes,
    workdays: person.workdays,
    rules,
    now,
  })

  const toolMinutes = verdict.apps.items.find((i) => i.label === rules.mainTool)?.minutes ?? 0
  // Temps actif que le focus n'explique pas : chez eux, la pastille « non identifié ».
  const untracked = Math.max(0, verdict.activeMinutes - verdict.apps.trackedMinutes)

  return {
    sites: verdict.apps.items,
    untrackedMinutes: untracked,
    stats: {
      activeMinutes: verdict.activeMinutes,
      pauseMinutes: verdict.pauseMinutes,
      idleMinutes: verdict.idleMinutes,
      toolMinutes,
      startedAtMs: verdict.firstStart,
    },
    timeline: buildTimeline(person.events, win.start, Math.min(win.end, now)),
  }
}

/**
 * Les segments de la fenêtre, avec les sites vus pendant chacun.
 *
 * `computeWindowVerdict` rend des totaux, pas des segments : on les rejoue ici depuis le même flux
 * d'événements, en croisant avec les intervalles de focus — exactement ce qu'affiche leur timeline
 * (`mypuls.app 2min · mypuls.app 1min…` sous chaque plage active).
 */
function buildTimeline(events: TrackerEvent[], start: number, end: number): TimelineRow[] {
  const rows: TimelineRow[] = []
  const focus = events
    .filter((e) => e.type === 'focus')
    .map((e) => ({
      at: Date.parse(e.at),
      label: (e.meta?.host as string | undefined) ?? (e.meta?.app as string | undefined) ?? null,
    }))
    .filter((f) => f.label != null && Number.isFinite(f.at))

  let state: TimelineRow['kind'] | 'off' = 'off'
  let segStart: number | null = null

  const close = (at: number): void => {
    if (state === 'off' || segStart == null) return
    const s = Math.max(segStart, start)
    const e = Math.min(at, end)
    if (e <= s) return
    rows.push({
      kind: state,
      startMs: s,
      endMs: e,
      minutes: Math.round((e - s) / 60_000),
      sites: state === 'active' ? sitesIn(focus, s, e) : [],
    })
  }
  // Transitions écrites en clair plutôt que déléguées à une fonction : TypeScript ne suit pas les
  // affectations faites dans une closure et garderait `state` figé sur « off ».
  for (const ev of events) {
    const t = Date.parse(ev.at)
    if (!Number.isFinite(t)) continue
    switch (ev.type) {
      case 'shift_start':
        close(t); state = 'active'; segStart = t; break
      case 'pause':
        if (state !== 'off') { close(t); state = 'pause'; segStart = t } break
      case 'resume':
        if (state !== 'off') { close(t); state = 'active'; segStart = t } break
      case 'idle_start':
        if (state === 'active') { close(t); state = 'idle'; segStart = t } break
      case 'idle_end':
        if (state === 'idle') { close(t); state = 'active'; segStart = t } break
      case 'shift_end':
        close(t); state = 'off'; segStart = null; break
      default:
        break
    }
  }
  if (state !== 'off') close(end)
  return rows
}

/** Sites vus dans une plage, cumulés par libellé, du plus long au plus court. */
function sitesIn(
  focus: { at: number; label: string | null }[],
  start: number,
  end: number,
): { label: string; minutes: number }[] {
  const byLabel = new Map<string, number>()
  for (let i = 0; i < focus.length; i++) {
    const f = focus[i]
    if (!f?.label) continue
    // Un focus vaut jusqu'au suivant — c'est la règle du domaine (`buildIntervals`).
    const next = focus[i + 1]
    const from = Math.max(f.at, start)
    const stop = Math.min(next ? next.at : end, end)
    if (stop <= from) continue
    byLabel.set(f.label, (byLabel.get(f.label) ?? 0) + (stop - from))
  }
  return [...byLabel.entries()]
    .map(([label, ms]) => ({ label, minutes: Math.round(ms / 60_000) }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}
