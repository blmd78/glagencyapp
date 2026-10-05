import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchMoneyTeamDay, fetchTeamMoney, login, type MoneyTeamDay } from '@glagency/mypuls'
import { createAdminClient, fetchAll } from '@glagency/db'
import {
  addDays,
  doublonKey,
  ficheIds,
  identityIssueRow,
  parseLot,
  planIdentityBackfill,
  proveGroup,
  proveLot,
  todayParis,
  UNDETERMINED_LABEL,
  type BackfillFiche,
  type BackfillPlan,
  type FicheFacts,
  type IdentityDirectoryEntry,
  type IdentityIssue,
  type LotDecision,
  type LotLine,
} from '@glagency/core'
import { loadEnv } from './env'
import { decodeEntities, normLabel } from './norm'
import { rows, toCsv } from './ops-utils'

// Rattrapage de l'identité chatteur — spec docs/superpowers/specs/2026-10-01-identite-chatteur-mypuls-design.md § 5.
//
// Usage : tsx src/identity-backfill.ts [--lot=<fichier>] [--apply] [--depuis=AAAA-MM-JJ]
//   (sans option)  RAPPORT, lecture seule : relit MyPuls jour par jour en remontant depuis hier,
//                  classe les fiches, prouve chaque groupe candidat → raw/identity/<jour>/plan.csv.
//   --lot=…        évalue aussi un lot validé (apps/ingestion/identity-lots/lot-N.csv) →
//                  raw/identity/<jour>/lot-decisions.csv. Toujours en lecture seule.
//   --lot=… --apply  applique LE LOT, et rien d'autre : sauvegarde CSV avant chaque opération, fusions
//                  des groupes prouvés, suppressions des fiches corrompues, publication des anomalies.
//                  REFUSÉ, avant toute écriture, quand : pas de --lot · lot sans ligne · --depuis ·
//                  historique MyPuls partiel · base autre que l'UAT sans IDENTITY_APPLY_PROD=oui
//                  (lu dans l'environnement réel, accord explicite de Benoit) · heure dans une fenêtre
//                  d'ingestion nocturne, ou fenêtre démarrée depuis la lecture des données.
//                  Un groupe dont la preuve est refusée est IGNORÉ (dit et expliqué) : les autres
//                  s'appliquent, puis code de sortie 2 (apply incomplet). À la première erreur de la
//                  base, tout s'arrête (code 1) et le fait / non fait est imprimé (une transaction par
//                  fusion : l'opération en erreur n'écrit rien).
//   --depuis=…     borne basse de la remontée (défaut : premier jour de chatter_creator_daily).
//
// Couverture : le rapport dit ce que MyPuls a réellement fourni (1re ligne de plan.csv, résumé console).
// Historique partiel (jour non servi après 3 tentatives, /team/money en échec) → chaque preuve OK porte
// « (historique partiel) » ; aucun jour relu → sortie non nulle et PAS de plan.csv.
//
// Base visée = SUPABASE_URL / SUPABASE_SECRET_KEY (le .env racine pointe la PROD ; pour l'UAT,
// préfixer la commande avec `uat` — cf. le plan).

type Db = ReturnType<typeof createAdminClient>

/** Seule base où `--apply` passe sans l'accord explicite `IDENTITY_APPLY_PROD=oui` ; toute autre = traitée comme la PROD. */
const UAT_REF = 'ihkksdmgtrbbjugeboks'
const PAUSE_MS = 500
/** Attentes avant la 2e et la 3e tentative d'un jour MyPuls en échec (un jour = 3 tentatives au plus). */
const RETRY_DELAYS_MS = [2_000, 5_000]
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const labelOf = (s: string) => decodeEntities(s).trim()
const REPORT_COLUMNS = ['action', 'garder', 'garder_id', 'vider', 'vider_id', 'mypuls_user_id', 'preuve', 'raisons', 'jours_verifies']
const cents = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100)

/**
 * Fenêtres des ingestions nocturnes, en UTC : 22:55 → 00:20 (crons 23:05 et 00:00) et 04:20 → 05:30
 * (crons 04:30 et 05:00) — `crons` de `apps/ingestion/wrangler.toml`, 10 à 20 min de marge de chaque
 * côté. Un apply n'y démarre pas : une fusion pendant qu'un run écrit les mêmes tables ferait
 * résoudre le run sur une fiche en cours de vidage. ⚠️ À réaligner si les crons changent.
 */
const NIGHTLY_WINDOWS = [
  { from: 22 * 60 + 55, minutes: 85, label: '22:55 → 00:20 UTC (crons de 23:05 et 00:00)' },
  { from: 4 * 60 + 20, minutes: 70, label: '04:20 → 05:30 UTC (crons de 04:30 et 05:00)' },
]

/** La fenêtre d'ingestion nocturne qui contient `now` (bornes comprises, à la minute), sinon null. */
export function nightlyWindow(now: Date): string | null {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes()
  for (const w of NIGHTLY_WINDOWS) {
    // Écart depuis le début de la fenêtre, modulo un jour : la première enjambe minuit.
    if ((((minute - w.from) % 1440) + 1440) % 1440 <= w.minutes) return w.label
  }
  return null
}

/**
 * La fenêtre dont le DÉBUT tombe dans ]from, to] (à la milliseconde), sinon null : des faits lus à `from`
 * sont périmés si un run nocturne a démarré depuis, même s'il est déjà fini à `to`.
 */
export function nightlyWindowStartedBetween(from: Date, to: Date): string | null {
  const DAY = 86_400_000
  const day0 = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  for (let day = day0; day <= to.getTime(); day += DAY) {
    for (const w of NIGHTLY_WINDOWS) {
      const startAt = day + w.from * 60_000
      if (startAt > from.getTime() && startAt <= to.getTime()) return w.label
    }
  }
  return null
}

/** Phrase de refus si `now` tombe dans une fenêtre d'ingestion nocturne, sinon null. */
function windowRefusal(now: Date): string | null {
  const w = nightlyWindow(now)
  return w
    ? `il est ${now.toISOString().slice(11, 16)} UTC, dans la fenêtre d'ingestion nocturne ${w} : une fusion pendant qu'un run écrit les mêmes tables fausserait ses contrôles. Relancer hors de cette fenêtre.`
    : null
}

async function loadBase(db: Db) {
  const [chatters, aliases, linked, cd, ccd, creatorDays, coverage] = await Promise.all([
    rows('chatters', fetchAll((f, t) =>
      db.from('chatters').select('id, display_name, email, mypuls_user_id').order('id').range(f, t))),
    rows('chatter_alias', fetchAll((f, t) =>
      db.from('chatter_alias').select('id, chatter_id, raw_label').order('id').range(f, t))),
    rows('profiles', fetchAll((f, t) =>
      db.from('profiles').select('id, chatter_id').not('chatter_id', 'is', null).order('id').range(f, t))),
    rows('chatter_daily', fetchAll((f, t) =>
      db.from('chatter_daily').select('chatter_id, date, ca').order('chatter_id').order('date').range(f, t))),
    rows('chatter_creator_daily', fetchAll((f, t) =>
      db.from('chatter_creator_daily').select('chatter_id, creator_id, date, ca')
        .order('chatter_id').order('creator_id').order('date').range(f, t))),
    rows('creator_daily', fetchAll((f, t) =>
      db.from('creator_daily').select('creator_id, date, ca').order('creator_id').order('date').range(f, t))),
    rows('mypuls_shift_coverage', fetchAll((f, t) =>
      db.from('mypuls_shift_coverage').select('day, slot, mypuls_user_id, chatter_label')
        .order('day').order('slot').order('mypuls_user_id').range(f, t))),
  ])
  return { chatters, aliases, linked, cd, ccd, creatorDays, coverage }
}
type Base = Awaited<ReturnType<typeof loadBase>>

/**
 * Faits de CHAQUE fiche (vide si aucune ligne), tirés des MÊMES lignes lues par `loadBase` :
 * `cd` = centimes par jour (chatter_daily), `ccd` = centimes par jour tous modèles confondus
 * (chatter_creator_daily), `ccdKeys` = chaque ligne de chatter_creator_daily en `modèle|jour`.
 * `proveGroup`/`proveLot` lisent `ccdKeys` pour « aucun (modèle, jour) en commun » et « la fiche
 * a des chiffres » : il doit couvrir exactement les mêmes lignes que `ccd`.
 */
function factsOf(base: Base): Map<string, FicheFacts> {
  const cd = new Map<string, Map<string, number>>()
  const ccd = new Map<string, Map<string, number>>()
  const keys = new Map<string, Set<string>>()
  const put = (m: Map<string, Map<string, number>>, id: string, day: string, c: number) => {
    const s = m.get(id) ?? new Map<string, number>()
    s.set(day, (s.get(day) ?? 0) + c)
    m.set(id, s)
  }
  for (const r of base.cd) put(cd, r.chatter_id, r.date, cents(r.ca))
  for (const r of base.ccd) {
    put(ccd, r.chatter_id, r.date, cents(r.ca))
    const k = keys.get(r.chatter_id) ?? new Set<string>()
    k.add(`${r.creator_id}|${r.date}`)
    keys.set(r.chatter_id, k)
  }
  const out = new Map<string, FicheFacts>()
  for (const c of base.chatters) {
    out.set(c.id, { cd: cd.get(c.id) ?? new Map(), ccd: ccd.get(c.id) ?? new Map(), ccdKeys: keys.get(c.id) ?? new Set() })
  }
  return out
}

/** Ce que la remontée MyPuls a réellement lu : qualifie le rapport, et permet à `--apply` de refuser un historique partiel. */
export interface HistoryCoverage {
  /** true seulement si CHAQUE jour de la plage a été servi ET que /team/money a répondu chaque jour. */
  complete: boolean
  /** Plage demandée : `from` (le plus ancien) → `to` (hier). */
  from: string
  to: string
  daysRead: number
  /** Premier jour non servi en remontant, avec sa cause ; null si la remontée est allée au bout. */
  stop: { day: string; reason: string } | null
  /** Jours où /team/money a échoué : les e-mails de ces jours manquent à l'annuaire. */
  teamMoneyFailures: string[]
  /** Phrase prête à écrire dans le rapport et la console. */
  note: string
}

export function historyCoverage(input: {
  from: string
  to: string
  daysRead: number
  stop: { day: string; reason: string } | null
  teamMoneyFailures: string[]
}): HistoryCoverage {
  const { from, to, daysRead, stop, teamMoneyFailures } = input
  const parts: string[] = []
  if (stop) parts.push(`${from} → ${stop.day} non relu (${stop.reason})`)
  if (teamMoneyFailures.length) {
    const shown = teamMoneyFailures.slice(0, 5).join(', ') + (teamMoneyFailures.length > 5 ? ', …' : '')
    parts.push(`/team/money indisponible ${teamMoneyFailures.length} jour(s) (${shown}) : e-mails de ces jours non relus`)
  }
  const complete = daysRead > 0 && parts.length === 0
  const note =
    daysRead === 0
      ? `AUCUN JOUR RELU (plage ${from} → ${to})${parts.length ? ` : ${parts.join(' ; ')}` : ''}`
      : complete
        ? `COMPLÈTE : ${daysRead} jour(s) relu(s), ${from} → ${to}`
        : `PARTIELLE : ${parts.join(' ; ')} ; ${daysRead} jour(s) relu(s)`
  return { complete, from, to, daysRead, stop, teamMoneyFailures, note }
}

/**
 * Rejoue `fn` jusqu'à 2 fois de plus (attentes `RETRY_DELAYS_MS`) avant de laisser l'erreur
 * remonter. Une session expirée n'est PAS rejouée : réessayer ne la ressuscite pas, et chaque
 * tentative est une requête MyPuls de plus.
 */
async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const msg = (e as Error).message
      const delay = RETRY_DELAYS_MS[attempt]
      if (delay === undefined || msg.includes('session expirée')) {
        throw attempt > 0 ? new Error(`${msg} (après ${attempt + 1} tentatives)`) : e
      }
      console.warn(`[identité] ${what} : ${msg} — nouvelle tentative dans ${delay / 1000} s (${attempt + 2}/${RETRY_DELAYS_MS.length + 1})`)
      await sleep(delay)
    }
  }
}

/**
 * Remonte MyPuls jour par jour, de hier jusqu'à `oldest`, et construit l'annuaire (id, libellé) :
 * ventes, select, JSON des équipes, e-mails de /team/money. S'ARRÊTE au premier jour non servi
 * (erreur HTTP, session, ou 0 vente alors que creator_daily a du CA, après 3 tentatives) et le
 * dit ; compte aussi les jours où /team/money a échoué.
 */
async function readMyPuls(cookie: string, oldest: string, yesterday: string, caByDay: Map<string, number>) {
  const directory: IdentityDirectoryEntry[] = []
  const seen = new Set<string>()
  const add = (id: string, label: string): void => {
    const l = labelOf(label)
    const k = `${id}|${l}`
    if (!l || seen.has(k)) return
    seen.add(k)
    directory.push({ mypulsUserId: id, label: l })
  }
  let lastServed: string | null = null
  let daysRead = 0
  let stop: { day: string; reason: string } | null = null
  const teamMoneyFailures: string[] = []
  for (let day = yesterday; day >= oldest; day = addDays(day, -1)) {
    let mt: MoneyTeamDay
    try {
      mt = await withRetry(day, async () => {
        const d = await fetchMoneyTeamDay(day, cookie)
        if (d.transactions.length === 0 && (caByDay.get(day) ?? 0) > 0) {
          throw new Error('aucune vente servie alors que creator_daily a du CA ce jour-là')
        }
        return d
      })
    } catch (e) {
      stop = { day, reason: (e as Error).message }
      break
    }
    for (const d of mt.directory) add(d.mypulsUserId, d.label)
    for (const t of mt.transactions) if (t.mypulsUserId) add(t.mypulsUserId, t.chatter)
    try {
      for (const tx of await withRetry(`${day} /team/money`, () => fetchTeamMoney(day))) {
        if (tx.attributed_user_id != null && tx.attributed_user) add(String(tx.attributed_user_id), tx.attributed_user)
      }
    } catch (e) {
      teamMoneyFailures.push(day)
      console.warn(`[identité] ${day} : /team/money indisponible (${(e as Error).message}) — e-mails non relus ce jour-là`)
    }
    lastServed = day
    daysRead++
    console.log(`[identité] ${day} : ${mt.transactions.length} vente(s), annuaire ${directory.length}`)
    await sleep(PAUSE_MS)
  }
  return { directory, add, lastServed, daysRead, stop, teamMoneyFailures }
}

async function run(): Promise<void> {
  // L'accord prod est lu dans l'environnement RÉEL, AVANT `loadEnv()` : une ligne `IDENTITY_APPLY_PROD=oui`
  // oubliée dans le .env (que `loadEnv` injecte) ne doit jamais armer l'apply.
  const prodAgreed = process.env.IDENTITY_APPLY_PROD === 'oui'
  const root = loadEnv()
  const apply = process.argv.includes('--apply')
  const lotArg = process.argv.find((a) => a.startsWith('--lot='))?.slice('--lot='.length)
  const depuis = process.argv.find((a) => a.startsWith('--depuis='))?.slice('--depuis='.length)
  if (apply && !lotArg) {
    throw new Error("--apply exige --lot=<fichier> : seules les fusions d'un lot validé par Benoit sont appliquées.")
  }
  // Une relecture tronquée de l'historique rendrait « même id » non fiable ET la couverture « complète »
  // sur la plage tronquée : le garde de couverture ne doit pas pouvoir être contourné.
  if (apply && depuis !== undefined) {
    throw new Error("--apply refusé avec --depuis : une relecture tronquée de l'historique MyPuls rend la preuve « même id » non fiable ; --apply relit tout l'historique.")
  }
  // Le lot est lu AVANT toute connexion : un fichier absent ou invalide échoue tout de suite, pas après
  // les minutes de relecture de MyPuls.
  const lines = lotArg ? parseLot(readFileSync(resolve(root, lotArg), 'utf8')) : []
  if (apply && !lines.length) throw new Error(`--apply refusé : le lot ${lotArg} ne contient aucune ligne.`)
  const yesterday = addDays(todayParis(), -1)
  if (depuis !== undefined) {
    const d = new Date(`${depuis}T00:00:00Z`)
    const calendar = /^\d{4}-\d{2}-\d{2}$/.test(depuis) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === depuis
    if (!calendar) throw new Error(`--depuis=${depuis} : date attendue au format AAAA-MM-JJ (jour réel du calendrier).`)
    if (depuis > yesterday) throw new Error(`--depuis=${depuis} : postérieur à hier (${yesterday}) — aucun jour à relire.`)
  }
  const host = new URL(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://inconnu').host
  console.log(`[identité] base : ${host} — ${apply ? `APPLY du lot ${lotArg}` : 'rapport (lecture seule)'}`)
  // Liste blanche : seule l'UAT passe sans accord ; toute autre base (la PROD, un hôte inconnu) l'exige.
  if (apply && !host.startsWith(`${UAT_REF}.`) && !prodAgreed) {
    throw new Error(
      `--apply sur « ${host} » : seule l'UAT (${UAT_REF}) s'applique sans accord ; toute autre base est traitée comme la PROD — poser IDENTITY_APPLY_PROD=oui dans l'environnement du shell (accord explicite de Benoit requis).`,
    )
  }
  // Refus tôt (la relecture de MyPuls dure plusieurs minutes) ; `applyLot` re-vérifie juste avant d'écrire.
  const early = apply ? windowRefusal(new Date()) : null
  if (early) throw new Error(`--apply refusé : ${early}`)

  const db = createAdminClient()
  // Instant de lecture des faits : `applyLot` refuse si un run nocturne a démarré depuis.
  const factsReadAt = new Date()
  const base = await loadBase(db)
  const caByDay = new Map<string, number>()
  for (const r of base.creatorDays) caByDay.set(r.date, (caByDay.get(r.date) ?? 0) + cents(r.ca))
  const oldest = depuis ?? base.ccd.reduce((m, r) => (r.date < m ? r.date : m), todayParis())

  // `login()` et non `refreshCookie()` : la rotation du remember-me appartient au Worker (cf. shifts.ts).
  const { cookie } = await login()
  const my = await readMyPuls(cookie, oldest, yesterday, caByDay)
  const coverage = historyCoverage({
    from: oldest,
    to: yesterday,
    daysRead: my.daysRead,
    stop: my.stop,
    teamMoneyFailures: my.teamMoneyFailures,
  })
  // Aucun jour relu : l'annuaire serait vide et le plan dirait « aucun doublon » à tort. Pas de rapport.
  if (my.lastServed === null) {
    throw new Error(`${coverage.note} — aucun rapport écrit : un plan sans historique MyPuls ressemblerait à « aucun doublon ».`)
  }
  for (const c of base.coverage) my.add(String(c.mypuls_user_id), c.chatter_label)
  const partial = coverage.complete ? '' : ' (historique partiel)'

  const facts = factsOf(base)
  const aliasesBy = new Map<string, string[]>()
  for (const a of base.aliases) aliasesBy.set(a.chatter_id, [...(aliasesBy.get(a.chatter_id) ?? []), a.raw_label])
  const linked = new Set(base.linked.map((p) => p.chatter_id as string))
  const activity = (id: string): number => {
    const f = facts.get(id)
    if (!f) return 0
    let t = 0
    for (const v of f.cd.values()) t += v
    for (const v of f.ccd.values()) t += v
    return t / 100
  }
  const fiches: BackfillFiche[] = base.chatters.map((c) => ({
    id: c.id,
    displayName: c.display_name,
    email: c.email ?? null,
    mypulsUserId: c.mypuls_user_id ?? null,
    linked: linked.has(c.id),
    activity: activity(c.id),
    aliases: aliasesBy.get(c.id) ?? [],
  }))
  const plan = planIdentityBackfill({ fiches, directory: my.directory, norm: normLabel })
  const ids = ficheIds({ fiches, directory: my.directory, norm: normLabel })

  const name = new Map(base.chatters.map((c) => [c.id, c.display_name]))
  const dir = resolve(root, 'apps/ingestion/raw/identity', todayParis())
  mkdirSync(dir, { recursive: true })

  // Groupes candidats (par fiche gardée), chacun avec sa double preuve.
  const candidateGroups = new Map<string, string[]>()
  for (const m of plan.merges) candidateGroups.set(m.keep, [...(candidateGroups.get(m.keep) ?? []), m.old])
  // Première ligne : ce que MyPuls a réellement fourni. Un plan lu sur un historique partiel ne dit
  // rien des jours non relus ; sans cette ligne, un CSV sans doublon se lirait « il n'y en a pas ».
  const report: Record<string, unknown>[] = [
    { action: 'couverture historique MyPuls', preuve: coverage.complete ? 'COMPLÈTE' : 'PARTIELLE', raisons: coverage.note },
  ]
  let refused = 0
  let withoutData = 0
  for (const [keep, olds] of candidateGroups) {
    const proof = proveGroup({
      keep: { facts: facts.get(keep)!, ids: ids.get(keep) ?? new Set() },
      olds: olds.map((o) => ({ facts: facts.get(o)!, ids: ids.get(o) ?? new Set() })),
    })
    // Aucun chiffre sur les fiches à vider : la compensation n'a rien à vérifier (0 jour), seule
    // l'identité est prouvée. On le dit — ce n'est pas une fusion prouvée au même titre que les autres.
    const sansDonnee = proof.ok && proof.daysChecked === 0
    if (!proof.ok) refused++
    else if (sansDonnee) withoutData++
    for (const o of olds) {
      report.push({
        action: 'fusion candidate',
        garder: name.get(keep),
        garder_id: keep,
        vider: name.get(o),
        vider_id: o,
        mypuls_user_id: proof.mypulsUserId,
        preuve: !proof.ok ? 'REFUS' : sansDonnee ? `OK SANS DONNÉES${partial}` : `OK${partial}`,
        raisons: sansDonnee
          ? "aucune donnée à déplacer : seule l'identité (même id MyPuls) est prouvée, la compensation n'a rien à vérifier"
          : proof.reasons.join(' ; '),
        jours_verifies: proof.daysChecked,
      })
    }
  }
  report.push(
    ...plan.links.map((l) => ({ action: 'id à poser (fait par l\'ingestion)', garder: name.get(l.chatterId), garder_id: l.chatterId, mypuls_user_id: l.mypulsUserId })),
    ...plan.corrupted.map((id) => ({ action: 'fiche corrompue', vider: name.get(id), vider_id: id })),
    ...plan.issues.map((i) => ({
      action: i.kind,
      garder: i.chatterId ? name.get(i.chatterId) : '',
      garder_id: i.chatterId,
      vider_id: i.otherChatterId,
      mypuls_user_id: i.mypulsUserId,
      raisons: i.detail,
    })),
  )
  writeFileSync(resolve(dir, 'plan.csv'), toCsv(report, REPORT_COLUMNS))
  const undetermined = fiches.filter((f) => UNDETERMINED_LABEL.test(f.displayName)).length
  console.log(
    `\n[identité] ${candidateGroups.size} groupe(s) candidat(s) (${plan.merges.length} fusion(s)) : ` +
      `${candidateGroups.size - refused - withoutData} prouvé(s), ${withoutData} sans donnée à déplacer, ${refused} refusé(s) ; ` +
      `${plan.links.length} id(s) à poser par l'ingestion, ${plan.corrupted.length} fiche(s) corrompue(s), ` +
      `${plan.issues.length} anomalie(s).`,
  )
  console.log(`[identité] ${undetermined} pseudo-fiche(s) « Indéterminé » (non traitées, D9).`)
  console.log(`[identité] couverture MyPuls — ${coverage.note}`)
  if (my.teamMoneyFailures.length) {
    console.log(`[identité] /team/money : ${my.teamMoneyFailures.length} jour(s) en échec sur ${coverage.daysRead} relu(s) : ${my.teamMoneyFailures.join(', ')}`)
  }
  console.log(`[identité] rapport : ${resolve(dir, 'plan.csv')}`)

  if (!lotArg) return
  const decisions = refuseForeignIdHolders(
    proveLot({ lines, facts, ids, linked, corrupted: new Set(plan.corrupted) }),
    base.chatters,
  )
  writeLotDecisions(dir, decisions, name, facts, coverage)
  if (apply) {
    const idOf = new Map(base.chatters.map((c) => [c.id, c.mypuls_user_id ?? null]))
    const result = await applyLot(db, dir, decisions, plan, coverage, name, idOf, factsReadAt)
    // Un apply incomplet ne doit jamais ressembler à un succès (les erreurs sortent en 1).
    if (result.skippedLines > 0) process.exitCode = 2
  }
}

const LOT_COLUMNS = ['ligne', 'action', 'slug', 'garder', 'garder_id', 'vider', 'vider_id', 'mypuls_user_id', 'decision', 'preuve', 'raisons', 'jours_verifies']

/**
 * Jours où une fiche à vider du groupe a des chiffres (ceux sur lesquels la compensation est
 * vérifiée) : recalcul de `GroupProof.daysChecked`, que `LotDecision` ne porte pas.
 */
function daysToCheck(d: LotDecision, facts: ReadonlyMap<string, FicheFacts>): number {
  const days = new Set<string>()
  for (const l of d.lines) {
    const f = facts.get(l.old)
    if (f) for (const k of [...f.cd.keys(), ...f.ccd.keys()]) days.add(k)
  }
  return days.size
}

/**
 * Décisions du lot, une ligne par fiche à vider : preuve OK, OK SANS DONNÉES (rien à déplacer : seule
 * l'identité est prouvée, comme dans le rapport) ou raisons du refus.
 */
function writeLotDecisions(
  dir: string,
  decisions: LotDecision[],
  name: Map<string, string>,
  facts: ReadonlyMap<string, FicheFacts>,
  coverage: HistoryCoverage,
): void {
  const partial = coverage.complete ? '' : ' (historique partiel)'
  const withoutData: LotDecision[] = []
  const out = decisions.flatMap((d) => {
    const days = daysToCheck(d, facts)
    // Une ligne « supprimer » est vide par construction (proveLot) : pas une fusion sans donnée.
    const sansDonnee = d.ok && d.lines.every((l) => l.action === 'fusionner') && days === 0
    if (sansDonnee) withoutData.push(d)
    return d.lines.map((l) => ({
      ligne: l.line,
      action: l.action,
      slug: l.slug,
      garder: l.keep ? name.get(l.keep) ?? '?' : '',
      garder_id: l.keep ?? '',
      vider: name.get(l.old) ?? '?',
      vider_id: l.old,
      mypuls_user_id: d.mypulsUserId,
      decision: d.ok ? 'ACCEPTÉE' : 'REFUSÉE',
      preuve: !d.ok ? 'REFUS' : sansDonnee ? `OK SANS DONNÉES${partial}` : `OK${partial}`,
      raisons: sansDonnee
        ? "aucune donnée à déplacer : seule l'identité (même id MyPuls) est prouvée, la compensation n'a rien à vérifier"
        : d.reasons.join(' ; '),
      jours_verifies: l.action === 'fusionner' ? days : '',
    }))
  })
  writeFileSync(resolve(dir, 'lot-decisions.csv'), toCsv(out, LOT_COLUMNS))
  const ok = decisions.filter((d) => d.ok).flatMap((d) => d.lines).length
  console.log(
    `[identité] lot : ${ok} ligne(s) acceptée(s) (dont ${withoutData.flatMap((d) => d.lines).length} sans donnée à déplacer), ` +
      `${out.length - ok} refusée(s) → ${resolve(dir, 'lot-decisions.csv')}`,
  )
  for (const d of withoutData) {
    console.log(`  SANS DONNÉES ${d.lines.map((l) => l.slug).join(' + ')} : seule l'identité est prouvée, rien à déplacer`)
  }
  for (const d of decisions.filter((x) => !x.ok)) {
    console.log(`  REFUS ${d.lines.map((l) => l.slug).join(' + ')} : ${d.reasons.join(' ; ')}`)
  }
  if (!coverage.complete) console.log(`[identité] historique MyPuls partiel : une preuve OK n'est pas fiable, --apply sera refusé.`)
}

/**
 * Sauvegarde, dans `dir`, de tout ce qu'une fusion ou une suppression peut toucher, AVANT d'écrire :
 * un `.csv` par table (lisible) ET un `.json` brut (restaurable tel quel : aucun échappement de
 * tableur, tableaux en JSON, `[]` pour une table vide). Une erreur de lecture lève : sans
 * sauvegarde, pas d'écriture. Refuse d'écraser un dossier existant : une sauvegarde n'est jamais
 * remplacée par celle d'une relance.
 */
async function backup(db: Db, dir: string, ids: string[]): Promise<void> {
  if (!ids.length) return
  if (existsSync(dir)) throw new Error(`sauvegarde ${dir} : le dossier existe déjà, refus de l'écraser`)
  mkdirSync(dir, { recursive: true })
  const list = `(${ids.join(',')})`
  const counts: string[] = []
  const dump = async (table: string, p: PromiseLike<{ data: object[]; error: { message: string } | null }>) => {
    const data = await rows(table, p)
    writeFileSync(resolve(dir, `sauvegarde_${table}.csv`), toCsv(data as Record<string, unknown>[]))
    writeFileSync(resolve(dir, `sauvegarde_${table}.json`), JSON.stringify(data, null, 1) + '\n')
    counts.push(`${table} ${data.length}`)
  }
  await dump('chatters', fetchAll((f, t) => db.from('chatters').select('*').in('id', ids).order('id').range(f, t)))
  await dump('profiles', fetchAll((f, t) =>
    db.from('profiles').select('id, display_name, chatter_id').in('chatter_id', ids).order('id').range(f, t)))
  await dump('chatter_daily', fetchAll((f, t) =>
    db.from('chatter_daily').select('*').in('chatter_id', ids).order('chatter_id').order('date').range(f, t)))
  await dump('chatter_creator_daily', fetchAll((f, t) =>
    db.from('chatter_creator_daily').select('*').in('chatter_id', ids)
      .order('chatter_id').order('creator_id').order('date').range(f, t)))
  await dump('chatter_alias', fetchAll((f, t) =>
    db.from('chatter_alias').select('*').in('chatter_id', ids).order('id').range(f, t)))
  await dump('relances', fetchAll((f, t) => db.from('relances').select('*').in('chatter_id', ids).order('id').range(f, t)))
  await dump('mypuls_shift_segments', fetchAll((f, t) =>
    db.from('mypuls_shift_segments').select('*').in('chatter_id', ids)
      .order('mypuls_user_id').order('started_at').range(f, t)))
  await dump('mypuls_shift_coverage', fetchAll((f, t) =>
    db.from('mypuls_shift_coverage').select('*').in('chatter_id', ids)
      .order('day').order('slot').order('mypuls_user_id').range(f, t)))
  await dump('spender_conversations', fetchAll((f, t) =>
    db.from('spender_conversations').select('*').in('assigned_chatter_id', ids)
      .order('creator_id').order('fan_id').range(f, t)))
  await dump('spender_assignment_events', fetchAll((f, t) =>
    db.from('spender_assignment_events').select('*')
      .or(`from_chatter_id.in.${list},to_chatter_id.in.${list}`).order('id').range(f, t)))
  await dump('rest_planning_cells', fetchAll((f, t) =>
    db.from('rest_planning_cells').select('*').overlaps('chatter_ids', ids)
      .order('week_start').order('day').order('col').range(f, t)))
  await dump('insights', fetchAll((f, t) =>
    db.from('insights').select('*').in('chatter_id', ids).order('insight_key').order('generated_at').range(f, t)))
  // Les anomalies de la fiche vidée sont EFFACÉES par la fusion (spec § 4) : à sauvegarder aussi.
  await dump('chatter_identity_issues', fetchAll((f, t) =>
    db.from('chatter_identity_issues').select('*')
      .or(`chatter_id.in.${list},other_chatter_id.in.${list}`).order('id').range(f, t)))
  console.log(`[identité] sauvegarde (CSV + JSON) ${dir} — ${counts.join(', ')}`)
}

/**
 * Refuse, dès l'évaluation, un groupe dont l'id MyPuls prouvé est porté par une fiche HORS du groupe :
 * `merge_chatters` (0183) refuse « id déjà porté par une autre fiche » à chaque fusion du groupe, et
 * `chatters.mypuls_user_id` est unique. La raison est ajoutée au groupe (visible dans lot-decisions.csv).
 */
function refuseForeignIdHolders(
  decisions: LotDecision[],
  chatters: { id: string; display_name: string; mypuls_user_id: string | null }[],
): LotDecision[] {
  const holder = new Map<string, { id: string; name: string }>()
  for (const c of chatters) if (c.mypuls_user_id) holder.set(c.mypuls_user_id, { id: c.id, name: c.display_name })
  return decisions.map((d) => {
    const h = d.ok && d.mypulsUserId ? holder.get(d.mypulsUserId) : undefined
    if (!h) return d
    const members = new Set(d.lines.flatMap((l) => (l.keep ? [l.keep, l.old] : [l.old])))
    if (members.has(h.id)) return d
    return {
      ...d,
      ok: false,
      reasons: [...d.reasons, `id MyPuls ${d.mypulsUserId} déjà porté par une fiche hors du groupe : « ${h.name} » (${h.id}) — la base refuserait chaque fusion`],
    }
  })
}

/**
 * Ordre d'application d'un groupe : la fiche à vider qui PORTE déjà l'id MyPuls prouvé d'abord. Elle
 * le transmet à la gardée ; fusionnée plus tard, la base refuserait l'id demandé (« déjà porté par
 * une autre fiche ») sur les fusions qui la précèdent. Ordre du lot conservé pour le reste.
 */
function applyOrder(d: LotDecision, idOf: ReadonlyMap<string, string | null>): LotLine[] {
  const carries = (l: LotLine): number => (d.mypulsUserId !== null && idOf.get(l.old) === d.mypulsUserId ? 1 : 0)
  return [...d.lines].sort((a, b) => carries(b) - carries(a))
}

/**
 * Applique LE LOT, rien d'autre (D13). Refuse AVANT toute écriture si l'historique MyPuls est partiel,
 * si l'heure tombe dans une fenêtre d'ingestion, ou si une fenêtre a commencé depuis la lecture des
 * faits (`factsReadAt`). Les groupes dont la preuve est refusée sont IGNORÉS (dits, avec leurs
 * raisons) ; pour chaque ligne des autres : sauvegarde de ce qu'elle touche (dossier propre à cette
 * exécution), puis fusion (une transaction par paire) ou suppression d'une fiche corrompue vide. Au
 * PREMIER échec, tout s'arrête : le fait et le non-fait sont imprimés. Si tout passe, publication des
 * anomalies du rapport et des candidates NON appliquées (Membres › Fiches MyPuls). Rend le nombre de
 * lignes faites et ignorées : l'appelant sort en code 2 si des lignes ont été ignorées.
 */
async function applyLot(
  db: Db,
  dir: string,
  decisions: LotDecision[],
  plan: BackfillPlan,
  coverage: HistoryCoverage,
  name: Map<string, string>,
  idOf: ReadonlyMap<string, string | null>,
  factsReadAt: Date,
): Promise<{ done: number; skippedLines: number }> {
  if (!coverage.complete) {
    throw new Error(
      `--apply refusé : historique MyPuls ${coverage.note}. Une preuve lue sur un historique partiel ne dit rien des jours non relus : relancer quand MyPuls les sert tous.`,
    )
  }
  const start = new Date()
  const inWindow = windowRefusal(start)
  if (inWindow) throw new Error(`--apply refusé : ${inWindow}`)
  const stale = nightlyWindowStartedBetween(factsReadAt, start)
  if (stale) {
    throw new Error(
      `--apply refusé : la fenêtre d'ingestion nocturne ${stale} a commencé depuis la lecture des données (${factsReadAt.toISOString().slice(11, 16)} UTC) : les faits ne sont plus à jour. Relancer l'évaluation, puis l'apply.`,
    )
  }
  // Un dossier par exécution : une relance ne remplace jamais une sauvegarde.
  const runDir = resolve(dir, 'sauvegardes', start.toISOString().replace(/[:.]/g, '-'))

  const accepted = decisions.filter((d) => d.ok)
  const skipped = decisions.filter((d) => !d.ok)
  const skippedLines = skipped.flatMap((d) => d.lines).length
  for (const d of skipped) {
    console.log(`[identité] IGNORÉ (preuve refusée) ${d.lines.map((l) => l.slug).join(' + ')} : ${d.reasons.join(' ; ')}`)
  }
  const ops = accepted.flatMap((d) => applyOrder(d, idOf).map((line) => ({ line, group: d })))
  for (const d of accepted) {
    const first = applyOrder(d, idOf)[0]
    if (first && first !== d.lines[0]) {
      console.log(
        `[identité] groupe ${d.lines.map((l) => l.slug).join(' + ')} : ${first.slug} d'abord (cette fiche porte l'id MyPuls ${d.mypulsUserId} ; fusionnée plus tard, la base refuserait l'id sur les fusions précédentes)`,
      )
    }
  }
  console.log(`[identité] apply : ${ops.length} opération(s) à faire, ${skippedLines} ligne(s) ignorée(s) (preuve refusée).`)

  // Fiches touchées par ce run (vidées ET gardées) : leurs candidates du plan sont périmées.
  const applied = new Set<string>()
  const done: string[] = []
  const doneOld = new Set<string>()
  for (const [i, op] of ops.entries()) {
    const { line: l, group } = op
    const what = `${l.action === 'supprimer' ? 'suppression' : 'fusion'} ${l.slug}`
    try {
      // Une longue série peut atteindre une fenêtre d'ingestion : on revérifie avant CHAQUE opération.
      const late = windowRefusal(new Date())
      if (late) throw new Error(late)
      const safe = l.slug.replace(/[^a-zA-Z0-9_-]/g, '_')
      await backup(db, resolve(runDir, `${String(l.line).padStart(2, '0')}-${safe}`), l.keep ? [l.keep, l.old] : [l.old])
      if (l.action === 'supprimer') {
        const { error } = await db.rpc('delete_empty_chatter', { p_id: l.old })
        if (error) throw new Error(error.message)
        console.log(`[identité] suppression ${l.slug} (« ${name.get(l.old) ?? '?'} ») : faite`)
      } else {
        if (!group.mypulsUserId) throw new Error('id MyPuls non établi pour un groupe accepté (anomalie interne)')
        const { data, error } = await db.rpc('merge_chatters', { p_keep: l.keep!, p_old: l.old, p_mypuls_id: group.mypulsUserId })
        if (error) throw new Error(error.message)
        console.log(`[identité] fusion ${l.slug} (« ${name.get(l.old) ?? '?'} » → « ${name.get(l.keep!) ?? '?'} ») :`, JSON.stringify(data))
      }
      applied.add(l.old)
      if (l.keep) applied.add(l.keep)
      done.push(l.slug)
      doneOld.add(l.old)
    } catch (e) {
      const message = (e as Error).message
      console.error(`\n[identité] ÉCHEC à « ${what} » : ${message}`)
      console.error(`[identité] FAIT (${done.length}) : ${done.join(', ') || 'rien'}`)
      console.error(
        `[identité] NON FAIT (${ops.length - i}, dont l'opération en échec) : ${ops.slice(i).map((o) => o.line.slug).join(', ')}`,
      )
      const groupDone = group.lines.filter((x) => doneOld.has(x.old))
      if (groupDone.length) {
        console.error(
          `[identité] groupe ${group.lines.map((x) => x.slug).join(' + ')} appliqué EN PARTIE : fait ${groupDone.map((x) => x.slug).join(', ')} ; non fait ${group.lines.filter((x) => !doneOld.has(x.old)).map((x) => x.slug).join(', ')} (chaque fusion faite est complète : une transaction chacune)`,
        )
      }
      console.error(
        `[identité] Rien n'est publié. Une réponse d'erreur de la base = cette opération n'a rien écrit (une transaction par fusion) ; sur coupure réseau son état est incertain. Relancer l'évaluation (sans --apply) avant toute reprise.`,
      )
      throw new Error(`apply interrompu à « ${what} » : ${message}`)
    }
  }

  const pending: IdentityIssue[] = plan.merges
    .filter((m) => !applied.has(m.old) && !applied.has(m.keep))
    .map((m) => ({
      issueKey: doublonKey(m.keep, m.old),
      kind: 'doublon',
      mypulsUserId: m.mypulsUserId,
      label: null,
      chatterId: m.keep,
      otherChatterId: m.old,
      day: null,
      amount: null,
      detail: `Fusion candidate (id MyPuls ${m.mypulsUserId}) non appliquée : à mettre dans un lot si la preuve du rapport est OK.`,
    }))
  const issues = [...plan.issues, ...pending]
  if (issues.length) {
    const { error } = await db.rpc('apply_chatter_identity', {
      p_links: [],
      p_issues: issues.map((i) => identityIssueRow(i, 'rattrapage')),
    })
    if (error) {
      throw new Error(`apply_chatter_identity : ${error.message} — les ${done.length} opération(s) du lot sont faites, seule la publication des anomalies a échoué.`)
    }
    console.log(`[identité] ${issues.length} anomalie(s) publiée(s) dans Membres › Fiches MyPuls`)
  }
  console.log(
    skippedLines
      ? `[identité] apply du lot INCOMPLET : ${done.length} opération(s) faite(s), ${skippedLines} ligne(s) IGNORÉE(S) (preuve refusée, voir plus haut) — code de sortie 2.`
      : `[identité] apply du lot terminé : ${done.length} opération(s) faite(s).`,
  )
  return { done: done.length, skippedLines }
}

const isCli = process.argv[1]?.endsWith('identity-backfill.ts')
if (isCli) {
  run().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
