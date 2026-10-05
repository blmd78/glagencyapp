import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchMoneyTeamDay, fetchTeamMoney, login, type MoneyTeamDay } from '@glagency/mypuls'
import { createAdminClient, fetchAll } from '@glagency/db'
import {
  addDays,
  ficheIds,
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
  type LotDecision,
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
//   --lot=… --apply  applique LE LOT, et rien d'autre : sauvegarde CSV, fusions des groupes
//                  prouvés, suppressions des fiches corrompues, publication des anomalies.
//                  Sur la PROD, exige en plus IDENTITY_APPLY_PROD=oui (accord explicite de Benoit).
//   --depuis=…     borne basse de la remontée (défaut : premier jour de chatter_creator_daily).
//
// Couverture : le rapport dit ce que MyPuls a réellement fourni (1re ligne de plan.csv, résumé console).
// Historique partiel (jour non servi après 3 tentatives, /team/money en échec) → chaque preuve OK porte
// « (historique partiel) » ; aucun jour relu → sortie non nulle et PAS de plan.csv.
//
// Base visée = SUPABASE_URL / SUPABASE_SECRET_KEY (le .env racine pointe la PROD ; pour l'UAT,
// préfixer la commande avec `uat` — cf. le plan).

type Db = ReturnType<typeof createAdminClient>

const PROD_REF = 'cqmfpsnqaxymswijdnfz'
const PAUSE_MS = 500
/** Attentes avant la 2e et la 3e tentative d'un jour MyPuls en échec (un jour = 3 tentatives au plus). */
const RETRY_DELAYS_MS = [2_000, 5_000]
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const labelOf = (s: string) => decodeEntities(s).trim()
const REPORT_COLUMNS = ['action', 'garder', 'garder_id', 'vider', 'vider_id', 'mypuls_user_id', 'preuve', 'raisons', 'jours_verifies']
const cents = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100)

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
  const root = loadEnv()
  const apply = process.argv.includes('--apply')
  const lotArg = process.argv.find((a) => a.startsWith('--lot='))?.slice('--lot='.length)
  const depuis = process.argv.find((a) => a.startsWith('--depuis='))?.slice('--depuis='.length)
  if (apply && !lotArg) {
    throw new Error("--apply exige --lot=<fichier> : seules les fusions d'un lot validé par Benoit sont appliquées.")
  }
  const yesterday = addDays(todayParis(), -1)
  if (depuis !== undefined) {
    const d = new Date(`${depuis}T00:00:00Z`)
    const calendar = /^\d{4}-\d{2}-\d{2}$/.test(depuis) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === depuis
    if (!calendar) throw new Error(`--depuis=${depuis} : date attendue au format AAAA-MM-JJ (jour réel du calendrier).`)
    if (depuis > yesterday) throw new Error(`--depuis=${depuis} : postérieur à hier (${yesterday}) — aucun jour à relire.`)
  }
  const host = new URL(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://inconnu').host
  console.log(`[identité] base : ${host} — ${apply ? `APPLY du lot ${lotArg}` : 'rapport (lecture seule)'}`)
  if (apply && host.startsWith(PROD_REF) && process.env.IDENTITY_APPLY_PROD !== 'oui') {
    throw new Error('--apply sur la PROD : poser IDENTITY_APPLY_PROD=oui (accord explicite de Benoit requis).')
  }

  const db = createAdminClient()
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

  // Task 6 : `applyLot` doit refuser quand `!coverage.complete` (historique partiel → pas d'apply).

  if (!lotArg) return
  const lines = parseLot(readFileSync(resolve(root, lotArg), 'utf8'))
  const decisions = proveLot({ lines, facts, ids, linked, corrupted: new Set(plan.corrupted) })
  writeLotDecisions(dir, decisions, name)
  if (apply) await applyLot(db, dir, decisions, plan)
}

// Remplacées en Task 6.
function writeLotDecisions(_dir: string, _d: LotDecision[], _name: Map<string, string>): void {
  throw new Error('--lot pas encore disponible (Task 6).')
}
async function applyLot(_db: Db, _dir: string, _d: LotDecision[], _plan: BackfillPlan): Promise<void> {
  throw new Error('--apply pas encore disponible (Task 6).')
}

const isCli = process.argv[1]?.endsWith('identity-backfill.ts')
if (isCli) {
  run().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
