import {
  fetchSegments,
  fetchShiftsPage,
  fetchTeamReport,
  type CoverageRow,
  type ShiftSegment,
} from '@glagency/mypuls'
import { createAdminClient, fetchAll } from '@glagency/db'
import {
  addDays,
  dayKpi,
  parisWallUtcMs,
  segmentBounds,
  slotOf,
  type SlotKey,
} from '@glagency/core'
import { normLabel } from './norm'

// Briques PURES du relevé MyPuls (aucune dépendance Node/CLI : ni fs, ni @sentry/node) →
// importables par le CLI (shifts.ts) ET, plus tard, par le Worker Cloudflare.
// Spec : docs/superpowers/specs/2026-09-01-releve-mypuls-design.md

type Db = ReturnType<typeof createAdminClient>

export interface ShiftSettings {
  idleMinutes: number
  breakMinutes: number
  coverageThreshold: number
}

export interface UnmatchedChatter {
  mypulsUserId: string
  label: string
  /** `inconnu` = aucun chatteur du CRM ne porte ce nom ; `ambigu` = plusieurs. */
  raison: 'inconnu' | 'ambigu'
}

export interface DayRunResult {
  day: string
  segments: number
  coverageRows: number
  /** Liens `chatters.mypuls_user_id` posés par ce run. */
  backfilled: number
  unmatched: UnmatchedChatter[]
  /** Pseudos MyPuls de modèles que le CRM ne connaît pas — à créer à la main. */
  unknownCreators: string[]
}

export async function loadSettings(db: Db): Promise<ShiftSettings> {
  const { data, error } = await db
    .from('mypuls_shift_settings')
    .select('idle_minutes, break_minutes, coverage_threshold')
    .eq('id', 1)
    .single()
  if (error) throw new Error(`mypuls_shift_settings : ${error.message}`)
  return {
    idleMinutes: data.idle_minutes,
    breakMinutes: data.break_minutes,
    coverageThreshold: Number(data.coverage_threshold),
  }
}

// ---------------------------------------------------------------------------
// Identité
// ---------------------------------------------------------------------------

interface Identity {
  /**
   * mypuls_user_id → chatters.id. LA clé d'identité du relevé, et celle du reste du CRM
   * (`chatter_daily`, `chatter_creators`, `insights`, `spender_*` pointent tous là).
   * Elle se remplit SANS compte membre : c'est ce qui donne une ligne nommée aux 372 lignes
   * `chatters` de production qui n'ont pas de `profiles` en face (relevé le 2026-09-04).
   */
  chatterByMypulsId: Map<string, string>
  /** mypuls_user_id → profiles.id, quand la chaîne complète est établie. Reste nécessaire : le
   *  créneau attendu, la fiche d'activité et une sanction exigent un compte membre. */
  profileByMypulsId: Map<string, string>
  backfilled: number
  unmatched: UnmatchedChatter[]
}

/**
 * Rapproche les chatteurs MyPuls du CRM, et CONSTRUIT le pont au passage.
 *
 * `chatters.mypuls_user_id` était vide sur les 481 lignes au 2026-09-01 : le rapprochement ne
 * peut donc démarrer que par le nom. Mais le CSV porte l'ID MyPuls, et une fois écrit c'est lui
 * qui sert — un chatteur qui change de pseudo cesse alors de disparaître du relevé.
 *
 * On rapproche sur `chatters` et NON sur `profiles` : `profiles` contient de vrais homonymes
 * (deux « Ridwane » actifs au 2026-09-01), `chatters` n'en avait aucun sur les 155 noms du CSV.
 *
 * On ne CRÉE jamais de `chatters` ici : le pipeline money-team le fait déjà sur label inconnu,
 * et le doubler produirait des doublons. Un non-rapproché reste visible dans `unmatched`.
 */
export async function resolveIdentities(
  db: Db,
  people: ReadonlyMap<string, string>,
): Promise<Identity> {
  const [{ data: chatters }, { data: aliases }, { data: profiles }] = await Promise.all([
    fetchAll((f, t) =>
      db.from('chatters').select('id, display_name, email, mypuls_user_id').order('id').range(f, t),
    ),
    fetchAll((f, t) =>
      db.from('chatter_alias').select('chatter_id, raw_label_norm').order('id').range(f, t),
    ),
    fetchAll((f, t) =>
      db.from('profiles').select('id, chatter_id').not('chatter_id', 'is', null).order('id').range(f, t),
    ),
  ])

  const byMypulsId = new Map<string, string>()
  // Un nom peut désigner plusieurs chatteurs : on garde la LISTE pour distinguer « inconnu »
  // d'« ambigu ». Un Map simple écraserait le doublon et rapprocherait au hasard.
  const byName = new Map<string, string[]>()
  const noLink = new Set<string>()

  const index = (label: string | null, id: string): void => {
    if (!label) return
    const k = normLabel(label)
    if (!k) return
    const list = byName.get(k)
    if (list) {
      if (!list.includes(id)) list.push(id)
    } else byName.set(k, [id])
  }

  for (const c of chatters ?? []) {
    if (c.mypuls_user_id) byMypulsId.set(String(c.mypuls_user_id), c.id)
    else noLink.add(c.id)
    index(c.display_name, c.id)
    index(c.email, c.id)
  }
  for (const a of aliases ?? []) index(a.raw_label_norm, a.chatter_id)

  const profileByChatter = new Map<string, string>()
  for (const p of profiles ?? []) if (p.chatter_id) profileByChatter.set(p.chatter_id, p.id)

  const unmatched: UnmatchedChatter[] = []
  const toLink: { chatterId: string; mypulsUserId: string }[] = []
  const chatterByMypulsId = new Map<string, string>()

  for (const [mypulsUserId, label] of people) {
    const known = byMypulsId.get(mypulsUserId)
    if (known) {
      chatterByMypulsId.set(mypulsUserId, known)
      continue
    }
    const candidates = byName.get(normLabel(label)) ?? []
    if (candidates.length === 0) {
      unmatched.push({ mypulsUserId, label, raison: 'inconnu' })
      continue
    }
    if (candidates.length > 1) {
      unmatched.push({ mypulsUserId, label, raison: 'ambigu' })
      continue
    }
    const chatterId = candidates[0] as string
    chatterByMypulsId.set(mypulsUserId, chatterId)
    // On ne réécrit jamais un lien existant : seul un chatteur SANS ID en reçoit un.
    if (noLink.has(chatterId)) toLink.push({ chatterId, mypulsUserId })
  }

  let backfilled = 0
  for (const { chatterId, mypulsUserId } of toLink) {
    // Un par un et non en lot : `mypuls_user_id` est UNIQUE, et un lot entier échouerait à
    // cause d'une seule collision. Une collision ici est un signal, pas une fatalité — on la
    // journalise et on continue.
    const { error } = await db
      .from('chatters')
      .update({ mypuls_user_id: mypulsUserId })
      .eq('id', chatterId)
      .is('mypuls_user_id', null)
    if (error) {
      console.warn(`[shifts] lien ${mypulsUserId} → ${chatterId} refusé : ${error.message}`)
      continue
    }
    backfilled++
  }

  const profileByMypulsId = new Map<string, string>()
  for (const [mypulsUserId, chatterId] of chatterByMypulsId) {
    const p = profileByChatter.get(chatterId)
    if (p) profileByMypulsId.set(mypulsUserId, p)
  }

  return { chatterByMypulsId, profileByMypulsId, backfilled, unmatched }
}

// ---------------------------------------------------------------------------
// Le run d'un jour
// ---------------------------------------------------------------------------

const iso = (ms: number): string => new Date(ms).toISOString()

/** Instants du créneau. Un créneau dont la fin précède le début franchit minuit. */
function slotBounds(day: string, start: string, end: string): { startAt: string; endAt: string } {
  const h = (v: string): number => {
    const [hh, mm] = v.split(':')
    return Number(hh) + Number(mm) / 60
  }
  const startH = h(start)
  const endH = h(end)
  const endDay = endH <= startH ? addDays(day, 1) : day
  return { startAt: iso(parisWallUtcMs(day, startH)), endAt: iso(parisWallUtcMs(endDay, endH)) }
}

/**
 * Efface la journée avant de la réécrire. Sans ça, un changement de réglage laisse cohabiter
 * deux mesures de la même journée et le temps compté double.
 */
async function purgeDay(
  db: Db,
  table: 'mypuls_shift_segments' | 'mypuls_shift_coverage',
  day: string,
): Promise<void> {
  const { error } = await db.from(table).delete().eq('day', day)
  if (error) throw new Error(`${table} purge ${day} : ${error.message}`)
}

/**
 * Déduplique un lot sur sa clé primaire AVANT l'upsert.
 *
 * Postgres refuse un `on conflict do update` qui toucherait deux fois la même ligne dans une
 * seule instruction (« cannot affect row a second time ») et fait alors échouer la journée
 * ENTIÈRE. Deux cas le provoquent : la bascule d'heure d'octobre, où deux heures murales
 * distinctes désignent le même instant, et deux libellés MyPuls qui se normalisent pareil.
 * On garde la première occurrence — les doublons sont identiques ou quasi.
 */
function dedupe<T>(rows: T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const r of rows) {
    const k = key(r)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

async function upsertChunked<T>(
  db: Db,
  table: 'mypuls_shift_segments' | 'mypuls_shift_coverage',
  rows: T[],
  onConflict: string,
): Promise<void> {
  const SIZE = 500
  for (let i = 0; i < rows.length; i += SIZE) {
    const { error } = await db
      .from(table)
      .upsert(rows.slice(i, i + SIZE) as never, { onConflict })
    if (error) throw new Error(`${table} : ${error.message}`)
  }
}

/**
 * Ingère UN jour.
 *
 * La fenêtre demandée à MyPuls est `day → day+1` et non `day → day` : le créneau du soir court
 * jusqu'à 05:00 le lendemain, et le tronquer fait chuter une couverture de 97,5 % à 37,1 %
 * (mesuré le 2026-09-01). On ne CONSERVE que les lignes du jour `day` ; celles de `day+1`,
 * elles-mêmes tronquées, sont refaites au run suivant.
 */
export async function ingestShiftsDay(
  db: Db,
  cookie: string,
  day: string,
  settings: ShiftSettings,
): Promise<DayRunResult> {
  // FENÊTRE ÉLARGIE DES DEUX CÔTÉS, et les deux bornes ont une raison différente.
  //
  // En AVAL (`day + 1`) : le créneau du soir court jusqu'à 05:00 le lendemain. Sans ce jour de
  // plus, sa couverture est tronquée — 37,1 % au lieu de 97,5 % sur un cas mesuré.
  //
  // En AMONT (`day - 1`) : MyPuls re-découpe l'activité à la borne de la fenêtre demandée. Une
  // session qui franchit minuit revient donc DEUX FOIS — entière sur le jour d'avant, et
  // tronquée en tête du jour demandé. Mesuré sur l'UAT avant correction : 206 paires de
  // segments qui se chevauchent, 7 043 minutes comptées deux fois, 68 chatteurs. En demandant
  // un jour de plus en amont, la session est rendue entière et rattachée à son jour de début —
  // le fragment n'existe plus (vérifié : 44 851 min → 43 611 min sur le 29/08).
  const from = addDays(day, -1)
  const to = addDays(day, 1)
  const page = await fetchShiftsPage(cookie)
  const creatorIds = page.creators.map((c) => c.mypulsCreatorId)

  const query = {
    from,
    to,
    idleMinutes: settings.idleMinutes,
    // `break = idle` : on ingère au grain FIN. Le regroupement en vacations se refait à
    // l'affichage, et il ne déforme aucune mesure — vérifié sur 137 chatteurs, `break=3` et
    // `break=60` donnent le même temps actif.
    breakMinutes: settings.idleMinutes,
    mypulsCreatorIds: creatorIds,
  }

  const allSegments: ShiftSegment[] = await fetchSegments(cookie, query)
  const allCoverage: CoverageRow[] = await fetchTeamReport(cookie, query)

  const segments = allSegments.filter((s) => s.day === day)
  const coverage = allCoverage.filter((c) => c.day === day)

  // Le CSV est le dictionnaire nom → ID : le tableau de couverture ne porte que le nom.
  // Le couple est bijectif (0 collision sur 155 personnes et 7 jours, vérifié).
  const people = new Map<string, string>()
  const idByName = new Map<string, string>()
  for (const s of allSegments) {
    people.set(s.mypulsUserId, s.chatterLabel)
    idByName.set(normLabel(s.chatterLabel), s.mypulsUserId)
  }

  const identity = await resolveIdentities(db, people)

  const segmentRows = segments.map((s) => {
    const b = segmentBounds(s)
    return {
      mypuls_user_id: s.mypulsUserId,
      day: s.day,
      started_at: iso(b.startMs),
      ended_at: iso(b.endMs),
      active_minutes: s.activeMinutes,
      messages: s.messages,
      models: s.models,
      chatter_id: identity.chatterByMypulsId.get(s.mypulsUserId) ?? null,
      profile_id: identity.profileByMypulsId.get(s.mypulsUserId) ?? null,
    }
  })

  const coverageRows: {
    day: string
    slot: SlotKey
    slot_start_at: string
    slot_end_at: string
    mypuls_user_id: string
    chatter_label: string
    chatter_id: string | null
    profile_id: string | null
    coverage_pct: number
    active_minutes: number
    messages: number
    first_at: string | null
    last_at: string | null
  }[] = []

  for (const c of coverage) {
    const mypulsUserId = idByName.get(normLabel(c.chatterLabel))
    if (!mypulsUserId) {
      // Présent dans le tableau de couverture mais absent du CSV : anomalie côté MyPuls. On la
      // signale plutôt que d'inventer un identifiant.
      identity.unmatched.push({ mypulsUserId: '', label: c.chatterLabel, raison: 'inconnu' })
      continue
    }
    const bounds = slotBounds(c.day, c.slotStart, c.slotEnd)
    // Première/dernière activité : l'heure est murale et SANS jour. Sur le créneau du soir
    // (21:00 → 05:00), « 04:59 » appartient au LENDEMAIN — la dater sur le jour du créneau
    // produit un `lastAt` antérieur au `firstAt`. On la replace dans la fenêtre du créneau.
    const at = (t: string | null): string | null => {
      if (t === null) return null
      const h = Number(t.slice(0, 2)) + Number(t.slice(3)) / 60
      const sameDay = parisWallUtcMs(c.day, h)
      const startMs = Date.parse(bounds.startAt)
      return iso(sameDay < startMs ? parisWallUtcMs(addDays(c.day, 1), h) : sameDay)
    }
    coverageRows.push({
      day: c.day,
      slot: slotOf(c.slotLabel, c.slotStart),
      slot_start_at: bounds.startAt,
      slot_end_at: bounds.endAt,
      mypuls_user_id: mypulsUserId,
      chatter_label: c.chatterLabel,
      chatter_id: identity.chatterByMypulsId.get(mypulsUserId) ?? null,
      profile_id: identity.profileByMypulsId.get(mypulsUserId) ?? null,
      coverage_pct: c.coveragePct,
      active_minutes: c.activeMinutes,
      messages: c.messages,
      first_at: at(c.firstTime),
      last_at: at(c.lastTime),
    })
  }

  // PURGE AVANT RÉÉCRITURE, et non simple upsert. Un upsert seul n'est idempotent que si les
  // bornes des segments ne bougent jamais — or elles bougent dès qu'on touche `idle`, le
  // paramètre qui décide du temps mesuré. Simulé sur le 29/08 : passer de 3 à 10 min ferait
  // cohabiter les anciennes et les nouvelles lignes, 44 851 → 80 659 minutes, sans qu'aucune
  // ne soit supprimée ni signalée. On efface la journée, puis on la réécrit.
  await purgeDay(db, 'mypuls_shift_segments', day)
  await purgeDay(db, 'mypuls_shift_coverage', day)

  await upsertChunked(db, 'mypuls_shift_segments', dedupe(segmentRows, (r) => `${r.mypuls_user_id}|${r.started_at}`), 'mypuls_user_id,started_at')
  await upsertChunked(db, 'mypuls_shift_coverage', dedupe(coverageRows, (r) => `${r.day}|${r.slot}|${r.mypuls_user_id}`), 'day,slot,mypuls_user_id')

  // Segments bornés à la FENÊTRE DES CRÉNEAUX (05:00 → 05:00), la même que celle du tableau —
  // et non au jour civil, sinon la tuile et le tableau comptent deux journées différentes.
  const winStart = Math.min(...coverageRows.map((r) => Date.parse(r.slot_start_at)))
  const winEnd = Math.max(...coverageRows.map((r) => Date.parse(r.slot_end_at)))
  const inWindow = coverageRows.length
    ? segments.filter((s) => {
        const b = segmentBounds(s)
        return b.endMs > winStart && b.startMs < winEnd
      })
    : segments

  const kpi = dayKpi(
    inWindow,
    coverageRows.map((r) => ({
      slot: r.slot,
      mypulsUserId: r.mypuls_user_id,
      coveragePct: r.coverage_pct,
      activeMinutes: r.active_minutes,
      messages: r.messages,
    })),
    {
      breakMinutes: settings.breakMinutes,
      coverageThreshold: settings.coverageThreshold,
      modelsTotal: creatorIds.length,
    },
  )

  const { error: kpiErr } = await db.from('mypuls_day_kpi').upsert(
    {
      day,
      chatters_actifs: kpi.chattersActifs,
      vacations: kpi.vacations,
      active_minutes: kpi.activeMinutes,
      messages: kpi.messages,
      models_worked: kpi.modelsWorked,
      models_total: kpi.modelsTotal,
      slots_held: kpi.slotsHeld,
      slots_total: kpi.slotsTotal,
      imported_at: new Date().toISOString(),
    },
    { onConflict: 'day' },
  )
  if (kpiErr) throw new Error(`mypuls_day_kpi : ${kpiErr.message}`)

  // Les modèles que MyPuls connaît et que le CRM ignore : sans eux le périmètre du relevé est
  // incomplet, et les segments d'un chatteur multi-modèles sont coupés artificiellement.
  const known = await knownCreatorIds(db)
  const unknownCreators = page.creators
    .filter((c) => !known.has(c.mypulsCreatorId))
    .map((c) => `${c.label} (#${c.mypulsCreatorId})`)

  return {
    day,
    segments: segmentRows.length,
    coverageRows: coverageRows.length,
    backfilled: identity.backfilled,
    unmatched: identity.unmatched,
    unknownCreators,
  }
}

async function knownCreatorIds(db: Db): Promise<Set<string>> {
  const { data, error } = await db.from('creators').select('mypuls_creator_id')
  if (error) throw new Error(`creators : ${error.message}`)
  const out = new Set<string>()
  for (const c of data ?? []) if (c.mypuls_creator_id) out.add(String(c.mypuls_creator_id))
  return out
}

/**
 * Journal du run. C'est LE garde-fou : sans lui, « le scrape a échoué » et « personne n'a
 * travaillé » sont indiscernables, et c'est cette confusion qui produirait des sanctions
 * injustes. Ne throw jamais — l'échec du journal ne doit pas masquer l'erreur d'origine.
 */
export async function recordShiftRun(
  db: Db,
  from: string,
  to: string,
  settings: ShiftSettings,
  outcome: { results?: DayRunResult[]; error?: unknown },
): Promise<void> {
  try {
    const results = outcome.results ?? []
    const { error } = await db.from('mypuls_shift_runs').insert({
      day_from: from,
      day_to: to,
      status: outcome.error ? 'echec' : 'ok',
      segments: results.reduce((n, r) => n + r.segments, 0),
      coverage_rows: results.reduce((n, r) => n + r.coverageRows, 0),
      unmatched: results.flatMap((r) => r.unmatched) as never,
      error:
        outcome.error == null
          ? null
          : outcome.error instanceof Error
            ? outcome.error.message
            : String(outcome.error),
      idle_minutes: settings.idleMinutes,
      coverage_threshold: settings.coverageThreshold,
    })
    if (error) throw error
  } catch (e) {
    console.error('[shifts] enregistrement mypuls_shift_runs échoué :', (e as Error).message)
  }
}
