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
import { allowedChatterIds, allowedProfileIds, getCreatorScope } from '@/lib/services/creator-scope'
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
  /**
   * `chatters.id` et non `profiles.id` (0144). Filtrer par compte membre excluait exactement
   * les gens que ce lot rend visibles : sur l'UAT, 29 % des lignes mesurées appartiennent à des
   * chatteurs parfaitement identifiés qui n'ont pas d'accès à l'app.
   */
  chatterId?: string
  model?: string
  slot?: string
}): Promise<VacationsPage> {
  const today = todayParis()
  const yesterday = addDays(today, -1)

  const chatterId = params.chatterId || null
  const maxDays = chatterId ? MAX_DAYS_ONE : MAX_DAYS_ALL

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
      p_chatter: chatterId ?? undefined,
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
  const [allowed, allowedChatters] = await Promise.all([
    allowedProfileIds(scope),
    allowedChatterIds(scope),
  ])

  // PÉRIMÈTRE, même règle que le Relevé : borné, on ne laisse rien passer d'autre — pas même
  // les segments sans identité, qu'on ne saurait pas attribuer. Ne pas savoir à qui une ligne
  // appartient n'autorise pas à la montrer à tout le monde.
  //
  // Les DEUX clés comptent : `chatter_creators` porte l'assignation des chatteurs sans compte,
  // que `profile_creators` ne connaît pas.
  const bounded = allowed !== null || allowedChatters !== null
  const visible = bounded
    ? segments.filter(
        (s) =>
          (s.profileId !== null && (allowed?.has(s.profileId) ?? false)) ||
          (s.chatterId !== null && (allowedChatters?.has(s.chatterId) ?? false)),
      )
    : segments

  const names = await resolveNames(visible)
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
  // Les segments d'un même `mypuls_user_id` portent la même identité : on l'indexe une fois.
  const idByUser = new Map<string, { chatterId: string | null; profileId: string | null }>()
  for (const s of visible) {
    if (!idByUser.has(s.mypulsUserId)) {
      idByUser.set(s.mypulsUserId, { chatterId: s.chatterId, profileId: s.profileId })
    }
  }

  const all: VacationRow[] = groupVacationsAt(domain, breakMinutes).map((v) => {
    const id = idByUser.get(v.mypulsUserId)
    return {
      key: `${v.mypulsUserId}:${v.startedAtMs}`,
      mypulsUserId: v.mypulsUserId,
      chatterId: id?.chatterId ?? null,
      profileId: id?.profileId ?? null,
      name: names.get(v.mypulsUserId) ?? `#${v.mypulsUserId}`,
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
    chatterId,
    model,
    slot,
    chatterOptions: await chatterOptions(allowedChatters),
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
 * `mypuls_user_id` → nom à afficher, en service-role.
 *
 * Deux tables, dans cet ordre : le COMPTE membre s'il existe (c'est le nom que l'encadrement
 * emploie), sinon le CHATTEUR. Sans le second, les 29 % de lignes sans compte retombaient sur
 * le pseudo MyPuls.
 *
 * Service-role, et pas la jointure de la RPC : `chatters_scoped_read` exige un modèle assigné
 * et la policy de `profiles` exige `is_admin() or is_manager()` — en `security invoker`, un
 * porteur de « presence » de rôle police aurait lu des lignes sans un seul nom. Le PÉRIMÈTRE
 * reste appliqué en amont.
 */
async function resolveNames(segments: RangeSegment[]): Promise<Map<string, string>> {
  const profileIds = [
    ...new Set(segments.map((s) => s.profileId).filter((v): v is string => v !== null)),
  ]
  const chatterIds = [
    ...new Set(segments.map((s) => s.chatterId).filter((v): v is string => v !== null)),
  ]
  if (profileIds.length === 0 && chatterIds.length === 0) return new Map()

  const admin = createAdminClient()
  const [profiles, chatters] = await Promise.all([
    profileIds.length
      ? admin.from('profiles').select('id, display_name').in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
    chatterIds.length
      ? admin.from('chatters').select('id, display_name').in('id', chatterIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (profiles.error) throw new Error(profiles.error.message)
  if (chatters.error) throw new Error(chatters.error.message)

  const byProfile = new Map((profiles.data ?? []).map((p) => [p.id, p.display_name ?? 'Sans nom']))
  const byChatter = new Map((chatters.data ?? []).map((c) => [c.id, c.display_name]))

  const out = new Map<string, string>()
  for (const s of segments) {
    if (out.has(s.mypulsUserId)) continue
    const name =
      (s.profileId ? byProfile.get(s.profileId) : null) ??
      (s.chatterId ? byChatter.get(s.chatterId) : null)
    if (name) out.set(s.mypulsUserId, name)
  }
  return out
}

/**
 * Les chatteurs proposés au filtre — tout le périmètre de l'appelant, pas seulement les
 * présents de la plage lue. Sans ça, choisir quelqu'un pour ÉLARGIR la période serait
 * impossible : il faudrait déjà l'avoir vu dans la journée affichée.
 *
 * Pris sur `chatters` et non sur `profiles` : c'est la clé du relevé, et la liste des comptes
 * membres en aurait écarté la moitié des gens que l'écran affiche.
 */
async function chatterOptions(
  allowedChatters: Set<string> | null,
): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient()
  let q = admin.from('chatters').select('id, display_name').eq('active', true)
  if (allowedChatters) {
    if (allowedChatters.size === 0) return []
    q = q.in('id', [...allowedChatters])
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((c) => ({ id: c.id, name: c.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}
