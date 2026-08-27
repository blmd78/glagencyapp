import { computeWindowVerdict, shiftByKey, shiftWindowOn, type Shift } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { readTrackerWindow } from '@/lib/tracking/window'
import { getCreatorScope } from '@/lib/services/creator-scope'
import type { BoardData, BoardGroup, BoardLiveChip, BoardRow } from '../types'

const NO_MODEL = 'Sans modèle'

/**
 * Le board d'un créneau : une ligne par chatteur, groupée par modèle travaillé.
 *
 * Tout est RECALCULÉ à la volée depuis les événements bruts — c'est ce que fait le tracker, et
 * c'est ce qui rend le board immédiat plutôt que dépendant d'une projection périodique (spec §6.4).
 * Les tables de faits ne servent qu'au-delà du créneau courant (fiche chatteur, récap).
 *
 * PÉRIMÈTRE : un manager, sous-manager ou policier AVEC modèles assignés ne voit que les chatteurs
 * de ses modèles — même règle que le Tracker police et le Rapport du soir
 * (`lib/services/creator-scope.ts`). Cloisonnement APPLICATIF assumé : la RLS de 0125 ouvre la
 * lecture à tout porteur de la page.
 */
export async function getShiftBoard(params: {
  callerId: string
  callerRole: string
  shiftKey?: string
  date?: string
  model?: string
  now?: number
}): Promise<BoardData> {
  const now = params.now ?? Date.now()
  const shift: Shift = shiftByKey(params.shiftKey ?? '') ?? currentShiftOf(now)
  // Sans date explicite, le créneau EN COURS : sa fenêtre se termine dans le futur, ce qui est
  // voulu — `summarize` clippe sur `now` par la position des segments, pas par la borne.
  const win = params.date ? shiftWindowOn(shift, params.date) : currentWindow(shift, now)

  const [{ people, rules }, scope] = await Promise.all([
    readTrackerWindow({ from: win.start, to: win.end, role: 'chatter' }),
    getCreatorScope(params.callerId, params.callerRole),
  ])

  const allowed = await allowedProfiles(scope, people.map((p) => p.profileId))

  const live: BoardLiveChip[] = []
  const rows: (BoardRow & { model: string })[] = []

  for (const person of people) {
    if (allowed && !allowed.has(person.profileId)) continue

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

    const toolItem = verdict.apps.items.find((i) => i.label === rules.mainTool)
    const toolMinutes = toolItem?.minutes ?? 0
    // Le retard se compte sur le PREMIER pointage du créneau. `firstStart` est déjà borné à la
    // fenêtre par `summarize` : hors fenêtre, il vaut null et il n'y a pas de retard à afficher.
    const lateBy = verdict.firstStart == null
      ? null
      : Math.round((verdict.firstStart - win.start) / 60_000)
    const lateness = lateBy != null && lateBy > rules.latenessMaxMinutes ? lateBy : null

    if (verdict.live) {
      live.push({
        profileId: person.profileId,
        name: person.name,
        state: verdict.live.state,
        sinceMs: verdict.live.since,
      })
    }

    rows.push({
      profileId: person.profileId,
      name: person.name,
      state: verdict.live?.state ?? 'off',
      toolMinutes,
      toolMinMinutes: rules.toolMinMinutes,
      activeMinutes: verdict.activeMinutes,
      latenessMinutes: lateness,
      // « À sanctionner » = sous le minimum d'outil principal. C'est la colonne que leur board met
      // en avant (« Mypuls · min. 5h30 ») et la seule dont le seuil soit explicite.
      // Un chatteur qui n'a jamais lancé l'app n'est pas « sous le minimum », il est absent.
      under: verdict.launched && toolMinutes < rules.toolMinMinutes,
      crashed: verdict.crashed,
      openShift: verdict.openShift,
      launched: verdict.launched,
      model: verdict.models.main ?? person.live?.currentModel ?? NO_MODEL,
    })
  }

  const models = [...new Set(rows.map((r) => r.model))].sort(byModelName)
  const filtered = params.model ? rows.filter((r) => r.model === params.model) : rows

  const groups: BoardGroup[] = models
    .filter((m) => !params.model || m === params.model)
    .map((model) => {
      const groupRows = filtered
        .filter((r) => r.model === model)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      return { model, rows: groupRows, underCount: groupRows.filter((r) => r.under).length }
    })
    .filter((g) => g.rows.length > 0)

  live.sort((a, b) => (b.sinceMs ?? 0) - (a.sinceMs ?? 0))

  return {
    date: win.date,
    shiftKey: shift.key,
    shiftLabel: win.label,
    shiftRange: win.range,
    models,
    groups,
    live,
    modelFilter: params.model ?? null,
    computedAtMs: now,
  }
}

/** « Sans modèle » toujours en dernier — c'est un fourre-tout, pas un modèle. */
function byModelName(a: string, b: string): number {
  if (a === NO_MODEL) return 1
  if (b === NO_MODEL) return -1
  return a.localeCompare(b, 'fr')
}

/**
 * Chatteurs visibles par l'appelant. `null` = aucune borne (admin, lecteur, encadrant sans modèle
 * assigné). Client admin : `profile_creators` est cloisonnée par RLS alors qu'on lit ici les
 * assignations d'AUTRES profils pour décider de l'affichage — même raison que `creator-scope.ts`.
 */
async function allowedProfiles(
  scope: Set<string> | null,
  profileIds: string[],
): Promise<Set<string> | null> {
  if (!scope || profileIds.length === 0) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profile_creators')
    .select('profile_id, creator_id')
    .in('profile_id', profileIds)
  if (error) throw new Error(error.message)
  const out = new Set<string>()
  for (const row of data ?? []) if (scope.has(row.creator_id)) out.add(row.profile_id)
  return out
}

/** Le shift en cours, sans importer `currentShift` deux fois pour rien. */
function currentShiftOf(now: number): Shift {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
      .format(new Date(now)),
  ) % 24
  if (hour >= 5 && hour < 13) return shiftByKey('matin') as Shift
  if (hour >= 13 && hour < 21) return shiftByKey('aprem') as Shift
  return shiftByKey('nuit') as Shift
}

/**
 * Fenêtre du créneau EN COURS — celle dont la fin est encore devant nous.
 * `shiftWindowOn` sur le jour de fin : pour un shift déjà commencé, c'est aujourd'hui ; pour la
 * nuit vue avant 5 h, c'est encore aujourd'hui (elle a commencé hier à 21 h).
 */
function currentWindow(shift: Shift, now: number) {
  const today = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(now))
  const win = shiftWindowOn(shift, today)
  if (win.end >= now) return win
  // La fin est déjà passée aujourd'hui (cas de la nuit consultée en journée) : la prochaine
  // occurrence se termine demain.
  const tomorrow = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' })
    .format(new Date(now + 86_400_000))
  return shiftWindowOn(shift, tomorrow)
}
