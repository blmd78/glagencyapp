import { createAdminClient } from '@glagency/db'
import { SLOT_KEYS, addDays, todayParis, type SlotKey } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { isDayInWindow } from '@/lib/periods'
import { allowedChatterIds, allowedProfileIds, getCreatorScope } from '@/lib/services/creator-scope'
import { getDayReport } from './get-day-report'
import type {
  BoardRangeRpc,
  ModelGroup,
  RangeRow,
  ReportKpi,
  ReportRow,
  ShiftReport,
  SlotActivity,
  SlotFilter,
} from '../types'

/** Le fourre-tout de l'ancien board, toujours affiché en dernier. */
const NO_MODEL = 'Sans modèle'

const isSlot = (v: string | null | undefined): v is SlotKey =>
  v != null && (SLOT_KEYS as readonly string[]).includes(v)

export async function getShiftReport(params: {
  callerId: string
  /** `baseRole` et NON `role` : ce dernier écrase manager/sous-manager/police et rendrait le
   *  périmètre INERTE — c'est le bug qu'avait le Board porté. */
  callerRole: string
  /** Bornes du sélecteur de dates du HEADER (`resolvePeriod`), source unique des périodes du CRM. */
  from: string
  to: string
  periodLabel: string
  /**
   * Grain choisi À LA MAIN par la bascule de la barre de filtres, et non déduit de la longueur
   * de la période : `day` ignore le sélecteur du header, `period` le suit. Deviner le grain
   * ferait changer la tête de l'écran sans qu'on l'ait demandé.
   */
  mode: 'day' | 'period'
  /** Jour affiché en mode `day` — validé contre la fenêtre autorisée, défaut hier. */
  day?: string
  slot?: string
  onlyExpected?: boolean
  belowOnly?: boolean
  /** L'appelant a-t-il le droit d'ÉCRIRE une sanction ? (`canWritePolice`, calculé par la page) */
  canWritePolice?: boolean
}): Promise<ShiftReport> {
  // AUJOURD'HUI N'EST JAMAIS RELEVÉ, et le sélecteur du header propose par défaut « 1er du mois
  // → aujourd'hui ». Sans ce plafond, l'écran ouvrirait sur une journée que l'ingestion refuse
  // d'écrire et signalerait un jour manquant à chaque visite. `todayParis()` et non
  // `new Date()` : sur Vercel (UTC) le jour civil bascule deux heures trop tôt.
  const yesterday = addDays(todayParis(), -1)
  const clampedToYesterday = params.to > yesterday
  const to = clampedToYesterday ? yesterday : params.to
  const from = params.from > to ? to : params.from
  const slot: SlotFilter = isSlot(params.slot) ? params.slot : 'all'

  const supabase = await createClient()
  // Le seuil qui fait foi vient des réglages, pas d'une constante : le figer ici ferait diverger
  // l'écran du paramètre que la page Réglages est censée piloter.
  const { data: settings } = await supabase
    .from('mypuls_shift_settings')
    .select('coverage_threshold')
    .eq('id', 1)
    .maybeSingle()
  const threshold = Number(settings?.coverage_threshold ?? 80)

  const scope = await getCreatorScope(params.callerId, params.callerRole)
  const [allowed, allowedChatters] = await Promise.all([
    allowedProfileIds(scope),
    allowedChatterIds(scope),
  ])

  const onlyExpected = params.onlyExpected ?? false
  const belowOnly = params.belowOnly ?? false
  const canReport = (params.canWritePolice ?? false) && isDayInWindow(to)
  const common = {
    from,
    to,
    periodLabel: params.periodLabel,
    clampedToYesterday,
    slot,
    onlyExpected,
    belowOnly,
    canReport,
  }

  // MODE JOUR → l'écran reprend son grain d'origine : jauge en minutes, timeline dépliable,
  // attendus silencieux. C'est là que ces trois choses ont un sens ; sur trente jours une jauge
  // en minutes n'en a plus aucun, et déplier l'effectif ferait des milliers de lignes de DOM.
  //
  // Le jour est validé contre la fenêtre autorisée plutôt que pris tel quel : un `?date=` forgé
  // pointant sur aujourd'hui afficherait une couverture tronquée, que MyPuls plafonne.
  if (params.mode === 'day') {
    const day = params.day && params.day <= yesterday ? params.day : yesterday
    return getDayReport({
      ...common,
      day,
      rpcSlot: slot === 'all' ? undefined : slot,
      threshold,
      allowed,
      allowedChatters,
    })
  }

  const { data, error } = await supabase.rpc('mypuls_shift_board_range', {
    p_from: from,
    p_to: to,
    // Omis = le défaut SQL (`null`, tous les créneaux) — les types générés n'acceptent pas `null`.
    p_slot: slot === 'all' ? undefined : slot,
    p_threshold: threshold,
  })
  if (error) throw new Error(error.message)

  // Cast explicite depuis `Json` : `.overrideTypes()` est inapplicable sur l'union récursive
  // (garde `IsValidResultOverride` de postgrest-js) — cf. docs/guidelines-data-loading.md.
  const rpc = (data as unknown as BoardRangeRpc | null) ?? {
    missingDays: [],
    run: null,
    rows: [],
    models: {},
    totals: { days: 0, activeMinutes: 0, messages: 0 },
  }

  // PÉRIMÈTRE. `allowed` null = aucune borne (admin, ou encadrant sans modèle assigné). Borné,
  // on ne laisse RIEN passer d'autre : ne pas savoir à qui une ligne appartient n'autorise pas à
  // la montrer à tout le monde. Les DEUX clés comptent depuis 0144 — `chatter_creators` porte
  // l'assignation des chatteurs sans compte membre, que `profile_creators` ne connaît pas.
  const bounded = allowed !== null || allowedChatters !== null
  const visible = bounded
    ? rpc.rows.filter(
        (r) =>
          (r.profileId !== null && (allowed?.has(r.profileId) ?? false)) ||
          (r.chatterId !== null && (allowedChatters?.has(r.chatterId) ?? false)),
      )
    : rpc.rows

  // Noms ET créneau attendu, lus en SERVICE-ROLE. La RPC est `security invoker` : la policy de
  // `profiles` exige `is_admin() or is_manager()`, si bien qu'une jointure y aurait rendu
  // `shift` NULL pour un porteur de « presence » de rôle police — et TOUTES ses lignes seraient
  // passées pour « hors créneau attendu », c'est-à-dire pour du renfort injugeable. Le
  // PÉRIMÈTRE, lui, reste appliqué au-dessus.
  const [profiles, chatters] = await Promise.all([profileInfo(visible), chatterNames(visible)])
  const rows = buildRows(visible, rpc.models, profiles, chatters)

  // PAR DÉFAUT : tout le monde. Masquer d'entrée les trois quarts de l'effectif donnait un écran
  // qui semblait vide. Le lien CRM ↔ MyPuls sert à NOMMER les gens, pas à en écarter.
  let shown = onlyExpected ? rows.filter((r) => r.expected !== null) : rows
  // « Sous le seuil » = a manqué au moins un jour SUR SON CRÉNEAU. Une personne sans créneau
  // attendu n'y figure jamais : il n'y a rien à comparer, donc rien à reprocher.
  if (belowOnly) shown = shown.filter((r) => missedDays(r) > 0)

  return {
    ...common,
    mode: 'period',
    run: rpc.run,
    kpi: buildKpi(rows),
    groups: groupByModel(shown),
    missingDays: rpc.missingDays,
    available: rpc.run !== null,
    threshold,
    totalRows: rows.length,
  }
}

/** Les agrégats (personne × créneau) recomposés en UNE ligne par personne. */
function buildRows(
  raw: RangeRow[],
  models: Record<string, string[]>,
  profiles: Map<string, { name: string; shift: SlotKey | null }>,
  chatters: Map<string, string>,
): ReportRow[] {
  const byPerson = new Map<string, RangeRow[]>()
  for (const r of raw) {
    const list = byPerson.get(r.mypulsUserId)
    if (list) list.push(r)
    else byPerson.set(r.mypulsUserId, [r])
  }

  const activity = (r: RangeRow): SlotActivity => ({
    slot: r.slot,
    days: r.days,
    held: r.held,
    activeMinutes: r.activeMinutes,
    messages: r.messages,
    latenessAvg: r.latenessAvg,
  })

  const out: ReportRow[] = []
  for (const [mypulsUserId, list] of byPerson) {
    const head = list[0] as RangeRow
    const profile = head.profileId ? profiles.get(head.profileId) : undefined
    const memberShift = profile?.shift ?? null
    const expectedRow = memberShift ? list.find((r) => r.slot === memberShift) : undefined

    out.push({
      key: mypulsUserId,
      mypulsUserId,
      chatterId: head.chatterId,
      profileId: head.profileId,
      name:
        profile?.name ??
        (head.chatterId ? chatters.get(head.chatterId) : undefined) ??
        head.chatterLabel,
      memberShift,
      expected: expectedRow ? activity(expectedRow) : null,
      other: list.filter((r) => r.slot !== memberShift).map(activity),
      // Jours DISTINCTS : quelqu'un présent matin ET après-midi le même jour a travaillé un
      // jour, pas deux. Des agrégats par créneau ne permettent pas de le savoir — on prend donc
      // le maximum, borne basse honnête, plutôt qu'une somme qui gonflerait le compte.
      daysWorked: Math.max(...list.map((r) => r.days)),
      activeMinutes: list.reduce((s, r) => s + r.activeMinutes, 0),
      messages: list.reduce((s, r) => s + r.messages, 0),
      models: models[mypulsUserId] ?? [],
    })
  }
  return out
}

/**
 * Les tuiles, sur les lignes du périmètre et du créneau affichés.
 *
 * « Postes tenus » ne compte QUE les jours du créneau attendu. C'est la correction centrale de
 * cet écran : compter toutes les lignes revenait à juger le renfort — dont la couverture est
 * minuscule par construction (16 % de moyenne en production) — et à annoncer un désastre qui
 * n'existe pas.
 */
function buildKpi(rows: ReportRow[]): ReportKpi {
  const models = new Set<string>()
  let activeMinutes = 0
  let messages = 0
  let heldDays = 0
  let expectedDays = 0
  let unjudgeable = 0

  for (const r of rows) {
    activeMinutes += r.activeMinutes
    messages += r.messages
    for (const m of r.models) models.add(m)
    if (r.expected) {
      heldDays += r.expected.held
      expectedDays += r.expected.days
    } else if (!r.memberShift) unjudgeable++
  }

  return { chatters: rows.length, activeMinutes, messages, models: models.size, heldDays, expectedDays, unjudgeable }
}

/**
 * Une carte par modèle, comme l'ancien board.
 *
 * Le modèle retenu est le DOMINANT de la période (celui qui a reçu le plus de messages) : une
 * personne multi-modèles apparaît une fois, là où elle a le plus travaillé. C'est le choix de
 * l'ancien tracker, à ceci près que chez lui le modèle était DÉCLARÉ et qu'ici il est OBSERVÉ.
 *
 * Les lignes sont triées par jours MANQUÉS décroissants : sur une période, ce qu'on cherche
 * n'est pas la meilleure couverture, c'est qui a manqué le plus souvent.
 */
function groupByModel(rows: ReportRow[]): ModelGroup[] {
  const byModel = new Map<string, ReportRow[]>()
  for (const r of rows) {
    const model = r.models[0] ?? NO_MODEL
    const list = byModel.get(model)
    if (list) list.push(r)
    else byModel.set(model, [r])
  }

  return [...byModel.entries()]
    .map(([model, list]) => ({
      model,
      rows: list.sort((a, b) => missedDays(b) - missedDays(a) || a.name.localeCompare(b.name, 'fr')),
      belowCount: list.filter((r) => missedDays(r) > 0).length,
    }))
    .sort((a, b) =>
      // « Sans modèle » toujours en dernier, comme chez eux.
      a.model === NO_MODEL ? 1 : b.model === NO_MODEL ? -1 : a.model.localeCompare(b.model, 'fr'),
    )
}

/** Jours manqués SUR LE CRÉNEAU ATTENDU. 0 pour qui n'en a pas : rien à comparer. */
const missedDays = (r: ReportRow): number => (r.expected ? r.expected.days - r.expected.held : 0)

/** Nom d'affichage ET créneau attendu des profils cités, en service-role. */
async function profileInfo(
  rows: RangeRow[],
): Promise<Map<string, { name: string; shift: SlotKey | null }>> {
  const ids = [...new Set(rows.map((r) => r.profileId).filter((v): v is string => v !== null))]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('id, display_name, shift').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map(
    (data ?? []).map((p) => [
      p.id,
      { name: p.display_name ?? 'Sans nom', shift: isSlot(p.shift) ? p.shift : null },
    ]),
  )
}

/** Noms des CHATTEURS cités — ceux qui n'ont pas de compte membre (0144). */
async function chatterNames(rows: RangeRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.chatterId).filter((v): v is string => v !== null))]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data, error } = await admin.from('chatters').select('id, display_name').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((c) => [c.id, c.display_name]))
}
