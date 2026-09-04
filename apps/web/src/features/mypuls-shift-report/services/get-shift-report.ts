import { createAdminClient } from '@glagency/db'
import {
  SLOT_KEYS,
  addDays,
  frWeekdayDate,
  groupVacationsAt,
  held,
  todayParis,
  type MypulsSegmentAt,
  type MypulsVacation,
  type SlotKey,
} from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { isDayInWindow } from '@/lib/periods'
import { allowedProfileIds, getCreatorScope } from '@/lib/services/creator-scope'
import type {
  SlotFilter,
  CoverageRow,
  ModelGroup,
  RawSegment,
  ReportRow,
  ShiftBoardRpc,
  ShiftReport,
} from '../types'

const DAYS = 14
/** Le fourre-tout de l'ancien board, toujours affiché en dernier. */
const NO_MODEL = 'Sans modèle'

const isSlot = (v: string | undefined): v is SlotKey =>
  v !== undefined && (SLOT_KEYS as readonly string[]).includes(v)

export async function getShiftReport(params: {
  callerId: string
  /** `baseRole` et NON `role` : ce dernier écrase manager/sous-manager/police et rendrait le
   *  périmètre INERTE — c'est le bug qu'avait le Board porté. */
  callerRole: string
  day?: string
  slot?: string
  onlyExpected?: boolean
  belowOnly?: boolean
  /** L'appelant a-t-il le droit d'ÉCRIRE une sanction ? (`canWritePolice`, calculé par la page) */
  canWritePolice?: boolean
}): Promise<ShiftReport> {
  // `todayParis()` et jamais `new Date()` : sur Vercel (UTC), entre 00 h et 02 h heure de Paris
  // le jour civil est encore la veille — le relevé serait vide sans qu'on comprenne pourquoi.
  const today = todayParis()
  const dayOptions = Array.from({ length: DAYS }, (_, i) => {
    const value = addDays(today, -1 - i)
    return { value, label: frWeekdayDate(value) }
  })
  // Hier par défaut : le créneau du soir d'aujourd'hui court jusqu'à 05 h demain.
  const day = params.day && dayOptions.some((o) => o.value === params.day) ? params.day : addDays(today, -1)
  // PAR DÉFAUT la journée complète — l'option « Journée complète » que l'ancien board plaçait
  // en tête de son sélecteur. Se caler d'office sur un seul créneau cachait les deux autres.
  const slot: SlotFilter = isSlot(params.slot) ? params.slot : 'all'

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('mypuls_shift_board', {
    p_day: day,
    // Omis = le défaut SQL (`null`), qui signifie « tous les créneaux »
    // (`p_slot is null or c.slot = p_slot`). Les types générés n'acceptent pas `null` ici.
    p_slot: slot === 'all' ? undefined : slot,
  })
  if (error) throw new Error(error.message)

  // Cast explicite depuis `Json` : `.overrideTypes()` est inapplicable sur l'union récursive
  // (garde `IsValidResultOverride` de postgrest-js) — cf. docs/guidelines-data-loading.md.
  const rpc = (data as unknown as ShiftBoardRpc | null) ?? {
    run: null,
    kpi: null,
    rows: [],
    segments: [],
    silent: [],
  }

  const threshold = rpc.run?.coverageThreshold ?? 80
  // Le seuil de regroupement en vacations est un RÉGLAGE, pas une constante : le figer à 60 en
  // dur faisait diverger l'écran du paramètre que la page Réglages est censée piloter.
  const { data: settings } = await supabase
    .from('mypuls_shift_settings')
    .select('break_minutes')
    .eq('id', 1)
    .maybeSingle()
  const breakMinutes = settings?.break_minutes ?? 60
  const scope = await getCreatorScope(params.callerId, params.callerRole)
  const allowed = await allowedProfileIds(scope)

  // PÉRIMÈTRE. `allowed` null = aucune borne (admin, ou encadrant sans modèle assigné) : on
  // montre tout ce que MyPuls a mesuré, y compris les libellés non rattachés au CRM.
  //
  // Borné, en revanche, on ne laisse RIEN passer d'autre que son périmètre. Une version
  // antérieure laissait filer les lignes sans `profileId` « puisqu'on ne peut pas les
  // attribuer » : sur l'UAT, un sous-manager borné à deux modèles voyait ainsi 145 des 264
  // lignes du jour, nominatives, avec couverture, retard et timeline — 94 % de ce qu'il lisait
  // ne le regardait pas, sur l'écran même qui sert à décider de retenues sur paie. Ne pas
  // savoir à qui une ligne appartient n'autorise pas à la montrer à tout le monde.
  const visible = allowed
    ? rpc.rows.filter((r) => r.profileId !== null && allowed.has(r.profileId))
    : rpc.rows

  // Les noms viennent du client admin et NON de la jointure de la RPC. La RPC est
  // `security invoker` : la policy de `profiles` exige `is_admin() or is_manager()`, si bien
  // qu'un porteur de « presence » de rôle police ou chatteur recevait 264 lignes SANS UN SEUL
  // nom, et zéro « aucune activité » — l'écran se lisait « personne n'était absent ».
  const names = await displayNames(rpc)

  const vacationsByUser = buildVacations(rpc.segments, breakMinutes)
  const enriched = visible.map((r) =>
    enrich(
      { ...r, memberName: r.memberName ?? (r.profileId ? (names.get(r.profileId) ?? null) : null) },
      threshold,
      vacationsByUser.get(r.mypulsUserId) ?? [],
    ),
  )

  // PAR DÉFAUT : tout le monde. On affiche ce que MyPuls a mesuré, pas un sous-ensemble —
  // masquer d'entrée les trois quarts de l'effectif donnait un écran qui semblait vide.
  // Le lien CRM ↔ MyPuls sert à NOMMER les gens, pas à en écarter.
  const onlyExpected = params.onlyExpected ?? false
  const belowOnly = params.belowOnly ?? false
  let shown = onlyExpected ? enriched.filter((r) => r.isExpected) : enriched
  if (belowOnly) shown = shown.filter((r) => !r.held)

  return {
    run: rpc.run,
    kpi: rpc.kpi,
    groups: groupByModel(shown),
    silent: (allowed ? rpc.silent.filter((s) => allowed.has(s.profileId)) : rpc.silent).map((s) => ({
      ...s,
      memberName: s.memberName || (names.get(s.profileId) ?? 'Sans nom'),
    })),
    day,
    slot,
    onlyExpected,
    belowOnly,
    dayOptions,
    available: rpc.run !== null,
    threshold,
    totalRows: enriched.length,
    heldRows: enriched.filter((r) => r.held).length,
    // `isDayInWindow` est la MÊME borne que le schéma serveur (`features/police/schema.ts`) :
    // au-delà de 14 jours la Server Action refuse, et un lien qui mène à un refus est pire
    // qu'une absence de lien. Le périmètre modèles, lui, est déjà appliqué — une ligne visible
    // ici est dans le périmètre de l'appelant.
    canReport: (params.canWritePolice ?? false) && isDayInWindow(day),
  }
}

/**
 * Segments → vacations, par chatteur.
 *
 * Le regroupement passe par `groupIntoVacations` du domaine, testé : c'est la même opération que
 * MyPuls fait côté serveur avec son paramètre `break`, et elle ne déforme aucune mesure (vérifié
 * sur 137 chatteurs — `break=3` et `break=60` donnent le même temps actif).
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
function enrich(r: CoverageRow, threshold: number, vacations: MypulsVacation[]): ReportRow {
  const slotMinutes = Math.round(
    (Date.parse(r.slotEndAt) - Date.parse(r.slotStartAt)) / 60_000,
  )
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
    vacations: vacations.filter((v) => v.endedAtMs > Date.parse(r.slotStartAt) && v.startedAtMs < Date.parse(r.slotEndAt)),
  }
}

/**
 * Une carte par modèle, comme l'ancien board.
 *
 * Le modèle retenu est le DOMINANT du créneau (celui qui a reçu le plus de messages) : un
 * chatteur multi-modèles apparaît une fois, là où il a le plus travaillé. C'est le choix de
 * l'ancien tracker (`verdict.models.main`), à ceci près que chez lui le modèle était DÉCLARÉ
 * dans un menu et qu'ici il est OBSERVÉ.
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
      rows: list.sort((a, b) => b.coveragePct - a.coveragePct || a.chatterLabel.localeCompare(b.chatterLabel, 'fr')),
      belowCount: list.filter((r) => !r.held).length,
    }))
    .sort((a, b) =>
      // « Sans modèle » toujours en dernier, comme chez eux.
      a.model === NO_MODEL ? 1 : b.model === NO_MODEL ? -1 : a.model.localeCompare(b.model, 'fr'),
    )
}

/**
 * Noms d'affichage des profils cités, lus en service-role.
 *
 * La RPC est `security invoker` : sa jointure sur `profiles` est soumise à la policy de cette
 * table, qui exige `is_admin() or is_manager()`. Un porteur de « presence » de rôle police ou
 * chatteur recevait donc des lignes sans nom. Les noms ne sont pas une donnée sensible ici —
 * l'écran est déjà réservé aux porteurs du droit, et le PÉRIMÈTRE, lui, reste appliqué.
 */
async function displayNames(rpc: ShiftBoardRpc): Promise<Map<string, string>> {
  const ids = [
    ...new Set([
      ...rpc.rows.map((r) => r.profileId).filter((v): v is string => v !== null),
      ...rpc.silent.map((s) => s.profileId),
    ]),
  ]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('id, display_name').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((p) => [p.id, p.display_name ?? 'Sans nom']))
}
