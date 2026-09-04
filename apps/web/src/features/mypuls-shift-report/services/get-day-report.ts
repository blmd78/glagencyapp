import { createAdminClient } from '@glagency/db'
import {
  addDays,
  frWeekdayDate,
  groupVacationsAt,
  held,
  todayParis,
  type MypulsSegmentAt,
  type MypulsVacation,
} from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type {
  DayCoverageRow,
  DayKpi,
  DayModelGroup,
  DayReportRow,
  RawSegment,
  ShiftBoardRpc,
  ShiftReportDay,
  ShiftReportCommon,
} from '../types'

/** Le fourre-tout de l'ancien board, toujours affiché en dernier. */
const NO_MODEL = 'Sans modèle'

/** Jours proposés au sélecteur du mode JOUR. Deux semaines : au-delà, on passe en période. */
const DAY_OPTIONS = 14

/**
 * Le relevé d'UNE journée — le grain d'origine de l'écran, restauré.
 *
 * Choisi EXPLICITEMENT par la bascule « Jour » de la barre de filtres (`?vue=jour`), et non
 * déduit de la longueur de la période : deviner le grain à partir du header ferait changer la
 * tête de l'écran sans qu'on l'ait demandé. En mode Jour, le sélecteur du header est ignoré —
 * c'est la définition du mode — et l'écran propose ses propres jours.
 *
 * C'est le grain où la jauge en minutes et la timeline des sessions ont un sens ; sur trente
 * jours elles n'en ont plus.
 *
 * La correction D7 s'applique ICI AUSSI : le renfort n'est jamais compté comme une faute. Sans
 * ça, sélectionner une seule journée rouvrait le défaut que la période venait de fermer.
 */
export async function getDayReport(
  params: {
    day: string
    /** Créneau passé À LA RPC — `undefined` quand le filtre vaut « tous » (défaut SQL `null`). */
    rpcSlot: string | undefined
    onlyExpected: boolean
    belowOnly: boolean
    threshold: number
    allowed: Set<string> | null
    allowedChatters: Set<string> | null
  } & Omit<ShiftReportCommon, 'run' | 'missingDays' | 'available' | 'totalRows' | 'threshold'>,
): Promise<ShiftReportDay> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('mypuls_shift_board', {
    p_day: params.day,
    // Omis = le défaut SQL (`null`), qui signifie « tous les créneaux ».
    p_slot: params.rpcSlot,
  })
  if (error) throw new Error(error.message)

  // Cast explicite depuis `Json` (cf. docs/guidelines-data-loading.md).
  const rpc = (data as unknown as ShiftBoardRpc | null) ?? {
    run: null,
    rows: [],
    segments: [],
    silent: [],
  }

  // Le seuil de regroupement en vacations est un RÉGLAGE, pas une constante : le figer à 60 en
  // dur faisait diverger l'écran du paramètre que la page Réglages pilote.
  const { data: settings } = await supabase
    .from('mypuls_shift_settings')
    .select('break_minutes')
    .eq('id', 1)
    .maybeSingle()
  const breakMinutes = settings?.break_minutes ?? 60

  // PÉRIMÈTRE, mêmes deux clés que le grain période : `chatter_creators` porte l'assignation des
  // chatteurs sans compte membre, que `profile_creators` ne connaît pas.
  const bounded = params.allowed !== null || params.allowedChatters !== null
  const visible = bounded
    ? rpc.rows.filter(
        (r) =>
          (r.profileId !== null && (params.allowed?.has(r.profileId) ?? false)) ||
          (r.chatterId !== null && (params.allowedChatters?.has(r.chatterId) ?? false)),
      )
    : rpc.rows

  // Noms en service-role : la RPC est `security invoker` et la policy de `profiles` exige
  // `is_admin() or is_manager()`, si bien qu'un porteur de « presence » de rôle police recevait
  // des lignes SANS UN SEUL nom. Le périmètre, lui, reste appliqué au-dessus.
  const [names, chatterLabels] = await Promise.all([
    displayNames(visible, rpc.silent),
    chatterNames(visible),
  ])

  const vacationsByUser = buildVacations(rpc.segments, breakMinutes)
  const rows = visible.map((r) =>
    enrich(
      {
        ...r,
        memberName:
          r.memberName ??
          (r.profileId ? (names.get(r.profileId) ?? null) : null) ??
          (r.chatterId ? (chatterLabels.get(r.chatterId) ?? null) : null),
      },
      params.threshold,
      vacationsByUser.get(r.mypulsUserId) ?? [],
    ),
  )

  let shown = params.onlyExpected ? rows.filter((r) => r.isExpected) : rows
  // « Sous le seuil » ne retient que les manquements SUR LE CRÉNEAU ATTENDU : filtrer sur le
  // renfort ferait remonter des gens dont la seule faute est d'avoir dépanné.
  if (params.belowOnly) shown = shown.filter((r) => r.isExpected && !r.held)

  // Le mode JOUR ignore la période du header — c'est sa définition. Il propose ses propres
  // jours, d'hier vers le passé : aujourd'hui n'est jamais relevé.
  const dayOptions = Array.from({ length: DAY_OPTIONS }, (_, i) => {
    const value = addDays(todayParis(), -1 - i)
    return { value, label: frWeekdayDate(value) }
  })

  return {
    mode: 'day',
    day: params.day,
    dayOptions,
    run: rpc.run,
    kpi: buildKpi(rows),
    groups: groupByModel(shown),
    silent: (params.allowed
      ? rpc.silent.filter((s) => params.allowed?.has(s.profileId))
      : rpc.silent
    ).map((s) => ({ ...s, memberName: s.memberName || (names.get(s.profileId) ?? 'Sans nom') })),
    missingDays: rpc.run ? [] : [params.day],
    available: rpc.run !== null,
    threshold: params.threshold,
    totalRows: rows.length,
    from: params.from,
    to: params.to,
    periodLabel: params.periodLabel,
    clampedToYesterday: params.clampedToYesterday,
    slot: params.slot,
    onlyExpected: params.onlyExpected,
    belowOnly: params.belowOnly,
    canReport: params.canReport,
  }
}

/**
 * Segments → vacations, par chatteur.
 *
 * Le regroupement passe par le domaine testé : c'est la même opération que MyPuls fait côté
 * serveur avec son paramètre `break`, et elle ne déforme aucune mesure (vérifié sur 137
 * chatteurs — `break=3` et `break=60` donnent le même temps actif).
 */
function buildVacations(segments: RawSegment[], breakMinutes: number): Map<string, MypulsVacation[]> {
  // Les instants viennent de la base, déjà résolus. Les repasser par l'heure murale pour les
  // reconvertir coûtait 414 ms de CPU par rendu (mesuré sur 2 800 segments) ET introduisait un
  // décalage d'une heure la nuit du retour à l'heure d'hiver, où une heure murale désigne deux
  // instants. `Date.parse` sur un `timestamptz` est exact et immédiat.
  const domain: MypulsSegmentAt[] = segments.map((s) => ({
    mypulsUserId: s.mypulsUserId,
    day: s.day,
    startedAtMs: Date.parse(s.startedAt),
    endedAtMs: Date.parse(s.endedAt),
    activeMinutes: s.activeMinutes,
    messages: s.messages,
    models: s.models,
  }))

  const out = new Map<string, MypulsVacation[]>()
  for (const v of groupVacationsAt(domain, breakMinutes)) {
    const list = out.get(v.mypulsUserId)
    if (list) list.push(v)
    else out.set(v.mypulsUserId, [v])
  }
  return out
}

/** Barre, retard et verdict — les trois colonnes centrales de l'ancien board. */
function enrich(r: DayCoverageRow, threshold: number, vacations: MypulsVacation[]): DayReportRow {
  const slotMinutes = Math.round((Date.parse(r.slotEndAt) - Date.parse(r.slotStartAt)) / 60_000)
  const target = Math.round((slotMinutes * threshold) / 100)
  const ok = held(r.coveragePct, threshold)
  return {
    ...r,
    slotMinutes,
    missingMinutes: ok ? 0 : Math.max(0, target - r.activeMinutes),
    // Retard = prise de poste après le début du créneau. Négatif (arrivé en avance) → 0 : être
    // en avance n'est pas un retard, et l'afficher comme tel serait absurde.
    latenessMinutes:
      r.firstAt === null
        ? null
        : Math.max(0, Math.round((Date.parse(r.firstAt) - Date.parse(r.slotStartAt)) / 60_000)),
    held: ok,
    vacations: vacations.filter(
      (v) => v.endedAtMs > Date.parse(r.slotStartAt) && v.startedAtMs < Date.parse(r.slotEndAt),
    ),
  }
}

/**
 * Les tuiles du jour, sur les lignes affichées.
 *
 * « Postes tenus » ne compte QUE les lignes du créneau attendu — même règle qu'au grain période.
 * Compter le renfort revenait à juger quelqu'un pour trois messages envoyés hors de son créneau,
 * où sa couverture vaut 2 % par construction.
 */
function buildKpi(rows: DayReportRow[]): DayKpi {
  const chatters = new Set<string>()
  const models = new Set<string>()
  let activeMinutes = 0
  let messages = 0
  let vacations = 0
  let heldRows = 0
  let total = 0
  let unjudgeable = 0

  for (const r of rows) {
    chatters.add(r.mypulsUserId)
    activeMinutes += r.activeMinutes
    messages += r.messages
    vacations += r.vacations.length
    for (const m of r.models) models.add(m)
    if (r.isExpected) {
      total++
      if (r.held) heldRows++
    } else if (!r.memberShift) unjudgeable++
  }

  return {
    chatters: chatters.size,
    activeMinutes,
    messages,
    vacations,
    models: models.size,
    held: heldRows,
    total,
    unjudgeable,
  }
}

/**
 * Une carte par modèle. Le modèle retenu est le DOMINANT du créneau (celui qui a reçu le plus de
 * messages) : un chatteur multi-modèles apparaît une fois, là où il a le plus travaillé.
 */
function groupByModel(rows: DayReportRow[]): DayModelGroup[] {
  const byModel = new Map<string, DayReportRow[]>()
  for (const r of rows) {
    const model = r.models[0] ?? NO_MODEL
    const list = byModel.get(model)
    if (list) list.push(r)
    else byModel.set(model, [r])
  }

  return [...byModel.entries()]
    .map(([model, list]) => ({
      model,
      rows: list.sort(
        (a, b) =>
          b.coveragePct - a.coveragePct || a.chatterLabel.localeCompare(b.chatterLabel, 'fr'),
      ),
      // Seuls les manquements SUR LEUR CRÉNEAU comptent (D7).
      belowCount: list.filter((r) => r.isExpected && !r.held).length,
    }))
    .sort((a, b) =>
      // « Sans modèle » toujours en dernier, comme chez eux.
      a.model === NO_MODEL ? 1 : b.model === NO_MODEL ? -1 : a.model.localeCompare(b.model, 'fr'),
    )
}

/** Noms d'affichage des profils cités, lus en service-role. */
async function displayNames(
  rows: DayCoverageRow[],
  silent: { profileId: string }[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set([
      ...rows.map((r) => r.profileId).filter((v): v is string => v !== null),
      ...silent.map((s) => s.profileId),
    ]),
  ]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('id, display_name').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((p) => [p.id, p.display_name ?? 'Sans nom']))
}

/** Noms des CHATTEURS cités — ceux qui n'ont pas de compte membre (0144). */
async function chatterNames(rows: DayCoverageRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.chatterId).filter((v): v is string => v !== null))]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data, error } = await admin.from('chatters').select('id, display_name').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((c) => [c.id, c.display_name]))
}
