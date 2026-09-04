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
import { allowedChatterIds, allowedProfileIds, getCreatorScope } from '@/lib/services/creator-scope'
import type {
  ReportKpi,
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
  const [allowed, allowedChatters] = await Promise.all([
    allowedProfileIds(scope),
    allowedChatterIds(scope),
  ])

  // PÉRIMÈTRE. `allowed` null = aucune borne (admin, ou encadrant sans modèle assigné) : on
  // montre tout ce que MyPuls a mesuré, y compris les libellés non rattachés au CRM.
  //
  // Borné, en revanche, on ne laisse RIEN passer d'autre que son périmètre. Une version
  // antérieure laissait filer les lignes sans `profileId` « puisqu'on ne peut pas les
  // attribuer » : sur l'UAT, un sous-manager borné à deux modèles voyait ainsi 145 des 264
  // lignes du jour, nominatives, avec couverture, retard et timeline — 94 % de ce qu'il lisait
  // ne le regardait pas, sur l'écran même qui sert à décider de retenues sur paie. Ne pas
  // savoir à qui une ligne appartient n'autorise pas à la montrer à tout le monde.
  //
  // DEUX clés depuis 0144, et les deux comptent. Le périmètre par `profile_creators` seul
  // aurait caché à un encadrant les lignes de SES modèles dès que la personne n'a pas de
  // compte membre — soit 29 % des lignes mesurées. `chatter_creators` est la même assignation,
  // du côté de la clé qui existe toujours.
  const inScope = (r: { chatterId: string | null; profileId: string | null }): boolean =>
    (r.profileId !== null && (allowed?.has(r.profileId) ?? false)) ||
    (r.chatterId !== null && (allowedChatters?.has(r.chatterId) ?? false))
  const visible = allowed || allowedChatters ? rpc.rows.filter(inScope) : rpc.rows

  // Les noms viennent du client admin et NON de la jointure de la RPC. La RPC est
  // `security invoker` : la policy de `profiles` exige `is_admin() or is_manager()`, si bien
  // qu'un porteur de « presence » de rôle police ou chatteur recevait 264 lignes SANS UN SEUL
  // nom, et zéro « aucune activité » — l'écran se lisait « personne n'était absent ».
  const names = await displayNames(rpc)
  const chatterNames = await chatterDisplayNames(rpc.rows)

  const vacationsByUser = buildVacations(rpc.segments, breakMinutes)
  const enriched = visible.map((r) =>
    enrich(
      {
        ...r,
        // Trois sources, dans cet ordre : la jointure de la RPC, le compte membre, puis le
        // CHATTEUR. C'est ce dernier qui nomme les 29 % de lignes qui n'ont pas de compte —
        // avant lui, elles s'affichaient sous le pseudo MyPuls, quand elles s'affichaient.
        memberName:
          r.memberName ??
          (r.profileId ? (names.get(r.profileId) ?? null) : null) ??
          (r.chatterId ? (chatterNames.get(r.chatterId) ?? null) : null),
      },
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
    // DÉRIVÉ des lignes montrées, et non repris de `mypuls_day_kpi`. Cette table est au grain
    // JOUR et pour toute l'agence : les tuiles ignoraient donc le créneau choisi ET le
    // périmètre modèles. Un sous-manager borné à deux modèles lisait « 250 chatteurs actifs »
    // au-dessus d'un tableau de 14 lignes, et choisir un créneau ne bougeait que le tableau.
    kpi: buildKpi(enriched),
    groups: groupByModel(shown),
    // Les silencieux sont par nature des COMPTES membres (seul un compte porte un créneau
    // attendu) : leur borne reste `profile_creators`, sans équivalent chatteur à ajouter.
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

/**
 * Noms d'affichage des CHATTEURS cités, lus en service-role.
 *
 * Même contrainte que `displayNames`, une table plus loin : `chatters_scoped_read` exige d'être
 * admin OU d'avoir au moins un modèle assigné. En `security invoker`, la RPC aurait donc rendu
 * `null` à un porteur de « presence » sans assignation — et l'écran serait retombé sur le pseudo
 * MyPuls pour tout le monde, ce que 0144 est précisément censé corriger. Le PÉRIMÈTRE, lui,
 * reste appliqué en amont (`inScope`).
 */
async function chatterDisplayNames(rows: CoverageRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.chatterId).filter((v): v is string => v !== null))]
  if (ids.length === 0) return new Map()
  const admin = createAdminClient()
  const { data, error } = await admin.from('chatters').select('id, display_name').in('id', ids)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((c) => [c.id, c.display_name]))
}

/**
 * Les tuiles, calculées sur les lignes du créneau affiché et du périmètre de l'appelant.
 *
 * Sur `enriched` et non sur `shown` : les deux bascules d'affichage ne doivent pas déplacer les
 * totaux — « Postes tenus » afficherait 0/N dès qu'on coche « sous le seuil seulement ».
 *
 * Les grandeurs sont des SOMMES et des cardinalités, jamais une moyenne de couverture : le
 * pourcentage de couverture est le verdict de MyPuls, et le moyenner sur plusieurs personnes
 * fabriquerait un chiffre que personne ne peut vérifier.
 */
function buildKpi(rows: ReportRow[]): ReportKpi {
  const chatters = new Set<string>()
  const models = new Set<string>()
  let activeMinutes = 0
  let messages = 0
  let vacations = 0

  for (const r of rows) {
    chatters.add(r.mypulsUserId)
    activeMinutes += r.activeMinutes
    messages += r.messages
    for (const m of r.models) models.add(m)
    // Les vacations déjà bornées au créneau par `enrich` — donc comptées dans la même
    // fenêtre que le temps et les messages de la même tuile.
    vacations += r.vacations.length
  }

  return {
    chatters: chatters.size,
    activeMinutes,
    messages,
    vacations,
    models: models.size,
    held: rows.filter((r) => r.held).length,
    total: rows.length,
  }
}
