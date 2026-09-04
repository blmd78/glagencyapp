import { createAdminClient } from '@glagency/db'
import {
  SLOT_KEYS,
  SLOT_START_HOUR,
  addDays,
  groupVacationsAt,
  todayParis,
  type MypulsSegmentAt,
  type SlotKey,
} from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { allowedProfileIds, getCreatorScope } from '@/lib/services/creator-scope'
import type { RangeSegment, VacationRow, VacationsPage } from '../types'

/**
 * Plafond de jours lus, et pourquoi il dépend du chatteur choisi.
 *
 * Une journée d'agence pèse ~2 600 segments. Sans chatteur choisi, une semaine en ferait
 * ~18 000 : quelques mégaoctets de JSON pour un tableau que personne ne lit d'un bloc. Avec un
 * chatteur, on retombe à ~20 segments par jour, et un mois devient parfaitement transportable.
 *
 * Le plafond n'est donc pas une limite arbitraire : c'est la contrepartie du filtre. On le dit
 * à l'écran plutôt que de tronquer en silence.
 */
const MAX_DAYS_ALL = 1
const MAX_DAYS_ONE = 31

const isSlot = (v: string | undefined | null): v is SlotKey =>
  v != null && (SLOT_KEYS as readonly string[]).includes(v)

const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Nombre de jours inclus entre deux jours ISO (bornes comprises). */
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

export async function getVacations(params: {
  callerId: string
  /** `baseRole` et NON `role` — sinon `getCreatorScope` est inerte (même piège que le Relevé). */
  callerRole: string
  from?: string
  to?: string
  profileId?: string
  model?: string
  slot?: string
}): Promise<VacationsPage> {
  const today = todayParis()
  const yesterday = addDays(today, -1)

  const profileId = params.profileId || null
  const maxDays = profileId ? MAX_DAYS_ONE : MAX_DAYS_ALL

  // Bornes demandées, remises dans l'ordre et jamais au-delà d'hier : la journée d'aujourd'hui
  // n'est pas encore relevée (le créneau du soir court jusqu'à 05 h demain).
  const to = isDay(params.to) && params.to <= yesterday ? params.to : yesterday
  let from = isDay(params.from) && params.from <= to ? params.from : to
  const asked = daysBetween(from, to)
  const clamped = asked > maxDays
  // On rogne par le DÉBUT : c'est la fin de la plage qu'on regarde en premier.
  if (clamped) from = addDays(to, -(maxDays - 1))

  const supabase = await createClient()
  const [segRes, runRes] = await Promise.all([
    supabase.rpc('mypuls_shift_segments_range', {
      p_from: from,
      p_to: to,
      // Omis = le défaut SQL (`null`, tous les chatteurs) — les types générés n'acceptent
      // pas `null` ici.
      p_profile: profileId ?? undefined,
    }),
    // Un seul run réussi couvrant la fin de plage suffit à dire que l'écran montre quelque
    // chose de réel. Sans ce test, une plage jamais relevée s'afficherait « 0 vacation »,
    // qui se lit « il n'a pas travaillé ».
    supabase
      .from('mypuls_shift_runs')
      .select('id')
      .eq('status', 'ok')
      .lte('day_from', to)
      .gte('day_to', from)
      .limit(1),
  ])
  if (segRes.error) throw new Error(segRes.error.message)
  if (runRes.error) throw new Error(runRes.error.message)

  // Cast explicite depuis `Json` (cf. docs/guidelines-data-loading.md).
  const segments = (segRes.data as unknown as RangeSegment[] | null) ?? []

  const scope = await getCreatorScope(params.callerId, params.callerRole)
  const allowed = await allowedProfileIds(scope)

  // PÉRIMÈTRE, même règle que le Relevé : borné, on ne laisse rien passer d'autre — pas même
  // les segments sans profil, qu'on ne saurait pas attribuer. Ne pas savoir à qui une ligne
  // appartient n'autorise pas à la montrer à tout le monde.
  const visible = allowed
    ? segments.filter((s) => s.profileId !== null && allowed.has(s.profileId))
    : segments

  const names = await displayNames(visible)
  const domain: MypulsSegmentAt[] = visible.map((s) => ({
    mypulsUserId: s.mypulsUserId,
    day: s.day,
    // `Date.parse` sur un `timestamptz` : exact et immédiat. Repasser par l'heure murale
    // coûtait 414 ms de CPU par rendu et se trompait d'une heure la nuit du retour à l'heure
    // d'hiver, où une heure murale désigne deux instants.
    startedAtMs: Date.parse(s.startedAt),
    endedAtMs: Date.parse(s.endedAt),
    activeMinutes: s.activeMinutes,
    messages: s.messages,
    models: s.models,
  }))

  const breakMinutes = await loadBreakMinutes(supabase)
  const profileByUser = new Map(
    visible.filter((s) => s.profileId).map((s) => [s.mypulsUserId, s.profileId as string]),
  )
  const labelByUser = new Map(visible.map((s) => [s.mypulsUserId, s.memberName]))

  const all: VacationRow[] = groupVacationsAt(domain, breakMinutes).map((v) => {
    const pid = profileByUser.get(v.mypulsUserId) ?? null
    return {
      key: `${v.mypulsUserId}:${v.startedAtMs}`,
      mypulsUserId: v.mypulsUserId,
      profileId: pid,
      name: (pid ? names.get(pid) : null) ?? labelByUser.get(v.mypulsUserId) ?? `#${v.mypulsUserId}`,
      day: v.day,
      startedAtMs: v.startedAtMs,
      endedAtMs: v.endedAtMs,
      activeMinutes: v.activeMinutes,
      messages: v.messages,
      models: v.models,
      segments: v.segments,
      slot: slotOfInstant(v.startedAtMs),
    }
  })

  const slot = isSlot(params.slot) ? params.slot : 'all'
  const model = params.model || null
  const rows = all
    .filter((r) => (slot === 'all' ? true : r.slot === slot))
    .filter((r) => (model ? r.models.some((m) => m.label === model) : true))
    .sort((a, b) => b.startedAtMs - a.startedAtMs || a.name.localeCompare(b.name, 'fr'))

  return {
    rows,
    from,
    to,
    profileId,
    model,
    slot,
    chatterOptions: await chatterOptions(allowed),
    // Les modèles proposés sont ceux OBSERVÉS sur la plage, pas le catalogue : filtrer sur un
    // modèle absent de la période ne rendrait jamais rien, sans dire pourquoi.
    modelOptions: [...new Set(all.flatMap((r) => r.models.map((m) => m.label)))].sort((a, b) =>
      a.localeCompare(b, 'fr'),
    ),
    totals: {
      vacations: rows.length,
      activeMinutes: rows.reduce((s, r) => s + r.activeMinutes, 0),
      messages: rows.reduce((s, r) => s + r.messages, 0),
    },
    daysRead: daysBetween(from, to),
    maxDays,
    clamped,
    available: (runRes.data ?? []).length > 0,
  }
}

/**
 * Créneau de rattachement d'une vacation, d'après son heure de DÉBUT en heure murale Paris.
 *
 * Une vacation peut chevaucher deux créneaux (une soirée qui déborde sur le matin) : on la
 * range là où elle commence. C'est un repère de lecture, JAMAIS un verdict — le verdict est
 * celui de MyPuls, sur le Relevé, et lui seul décide d'un signalement.
 */
const PARIS_HOUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  hour12: false,
})

function slotOfInstant(ms: number): SlotKey {
  const h = Number(PARIS_HOUR.format(new Date(ms))) % 24
  // 05→13 matin, 13→21 aprem, sinon soir (21→05, qui franchit minuit).
  if (h >= SLOT_START_HOUR.matin && h < SLOT_START_HOUR.aprem) return 'matin'
  if (h >= SLOT_START_HOUR.aprem && h < SLOT_START_HOUR.soir) return 'aprem'
  return 'soir'
}

/** Le regroupement est un RÉGLAGE, pas une constante — même lecture que le Relevé. */
async function loadBreakMinutes(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { data } = await supabase
    .from('mypuls_shift_settings')
    .select('break_minutes')
    .eq('id', 1)
    .maybeSingle()
  return data?.break_minutes ?? 60
}

/**
 * Noms d'affichage, en service-role.
 *
 * La RPC est `security invoker` et la policy de `profiles` exige `is_admin() or is_manager()` :
 * un porteur de « presence » de rôle police recevrait des lignes sans nom. Même contournement
 * que le Relevé, et même raison — les noms ne sont pas sensibles ici, l'écran est déjà réservé
 * aux porteurs du droit, et le PÉRIMÈTRE reste appliqué.
 */
async function displayNames(segments: RangeSegment[]): Promise<Map<string, string>> {
  const ids = [...new Set(segments.map((s) => s.profileId).filter((v): v is string => v !== null))]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('id, display_name').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((p) => [p.id, p.display_name ?? 'Sans nom']))
}

/**
 * Les chatteurs proposés au filtre — le périmètre de l'appelant, pas seulement les présents de
 * la plage lue. Sans ça, choisir quelqu'un pour ÉLARGIR la période serait impossible : il
 * faudrait déjà l'avoir vu dans la journée affichée.
 */
async function chatterOptions(allowed: Set<string> | null): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient()
  let q = admin
    .from('profiles')
    .select('id, display_name')
    .eq('role', 'chatteur')
    .is('left_at', null)
  if (allowed) {
    if (allowed.size === 0) return []
    q = q.in('id', [...allowed])
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((p) => ({ id: p.id, name: p.display_name ?? 'Sans nom' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}
