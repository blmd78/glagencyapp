import { randomUUID } from 'node:crypto'
import {
  fetchTeamMoney,
  fetchMoneyTeamDay,
  fetchDashboardStats,
  fetchDashboardSubscriptions,
  login,
  type MoneyTeamDay,
} from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'

type Db = ReturnType<typeof createAdminClient>
/** Récupère+parse la page money-team d'un jour. Injectable : Node=cheerio, Worker=HTMLRewriter. */
type FetchMoneyTeam = (day: string, cookie: string) => Promise<MoneyTeamDay>

/** Dépendances runtime injectables (défauts = implémentations Node/cheerio). */
export interface PipelineDeps {
  fetchMoneyTeam?: FetchMoneyTeam
}

/**
 * Pipeline quotidien → upsert creator_daily. Sources par ordre de priorité :
 * dashboard/stats + dashboard/subscriptions (session web : CA complet ventilé + nouveaux
 * abonnés + abonnés actifs), fallback /team/money (API : messagerie seule) si le dashboard
 * est indisponible. Idempotent (upsert `creator_id,date`). Auto-cicatrisant : sans argument,
 * rattrape depuis le dernier jour connu (souvent partiel) jusqu'à aujourd'hui.
 * Écrit aussi le brut dans apps/ingestion/raw/<date>.json.
 *
 * Attribution par chatteur : depuis le dashboard money-team (session web, l'API ne donne
 * pas l'expéditeur) → chatter_daily + chatter_creator_daily. Cf. ingestChatterDay.
 *
 * TODO (suite) : runRules → insights.
 */

const PRIV: Record<string, string> = {
  alice_prvv: 'Alice (privé)',
  carlaprive: 'Carla (privé)',
  juliepvv: 'Julie (privé)',
}
const MAX_CATCHUP = 60
const round = (n: number) => Math.round(n * 100) / 100
const iso = (d: Date) => d.toISOString().slice(0, 10)
function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

// Normalise un label scrapé (casse + espaces) → clé de rapprochement `chatter_alias`.
// On NE retire PAS les accents : « José » et « Jose » peuvent être deux personnes distinctes.
const normLabel = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Valeurs dashboard d'un (modèle, jour) : CA ventilé (€) + abonnés (comptes). */
interface DashDay {
  ca: number
  ppv: number
  tips: number
  renew: number
  newSubs: number
  renewals: number
  subsActive: number
}

/**
 * Séries dashboard sur [from..to] (bornes incluses) → Map<date, Map<nom modèle, DashDay>>.
 * `+=` partout : plusieurs pseudos MyPuls peuvent pointer vers le même modèle.
 */
async function fetchDashboardRange(
  from: string,
  to: string,
  cookie: string,
  resolveCreator: (creatorId: number, label: string) => string | null,
): Promise<Map<string, Map<string, DashDay>>> {
  const [stats, subs] = await Promise.all([
    fetchDashboardStats(from, to, cookie),
    fetchDashboardSubscriptions(from, to, cookie),
  ])
  const out = new Map<string, Map<string, DashDay>>()
  const entry = (date: string, name: string): DashDay => {
    let m = out.get(date)
    if (!m) {
      m = new Map()
      out.set(date, m)
    }
    let e = m.get(name)
    if (!e) {
      e = { ca: 0, ppv: 0, tips: 0, renew: 0, newSubs: 0, renewals: 0, subsActive: 0 }
      m.set(name, e)
    }
    return e
  }
  for (const ds of stats.datasets) {
    const name = resolveCreator(ds.creatorId, ds.label)
    if (!name) continue
    stats.labels.forEach((date, i) => {
      const e = entry(date, name)
      e.ca += ds.data[i] ?? 0
      e.ppv += ds.breakdown.ppv?.[i] ?? 0
      e.tips += ds.breakdown.tips?.[i] ?? 0
      e.renew += ds.breakdown.renew?.[i] ?? 0
    })
  }
  for (const ds of subs.newSubsDatasets) {
    const name = resolveCreator(ds.creatorId, ds.label)
    if (!name) continue
    subs.labels.forEach((date, i) => {
      const e = entry(date, name)
      e.newSubs += ds.data[i] ?? 0
      e.renewals += ds.renewals?.[i] ?? 0
    })
  }
  for (const ds of subs.totalSubsDatasets) {
    const name = resolveCreator(ds.creatorId, ds.label)
    if (!name) continue
    subs.labels.forEach((date, i) => {
      entry(date, name).subsActive += ds.data[i] ?? 0
    })
  }
  return out
}

/**
 * Attribution par chatteur d'un jour, depuis le dashboard money-team (session web) :
 * résumé → chatter_daily, transactions → chatter_creator_daily. Mapping par display_name
 * (même source que le seed) ; les chatteurs inconnus sont créés.
 */
async function ingestChatterDay(
  db: Db,
  day: string,
  cookie: string,
  nameToChatter: Map<string, string>,
  aliasToChatter: Map<string, string>,
  nameToId: Map<string, string>,
  pseudoToName: (p: string) => string | null,
  fetchMoneyTeam: FetchMoneyTeam,
): Promise<void> {
  const mt = await fetchMoneyTeam(day, cookie)

  // Résolution chatteur via chatter_alias (label normalisé → chatter_id) : robuste aux variantes
  // de casse/accents. Bootstrap : un label inconnu crée l'alias (et le chatteur si vraiment
  // nouveau) → les runs suivants mappent de façon déterministe.
  const rawNames = new Set<string>()
  for (const c of mt.chatters) if (c.name) rawNames.add(c.name.trim())
  for (const t of mt.transactions) if (t.chatter) rawNames.add(t.chatter.trim())

  const resolved = new Map<string, string>() // label brut → chatter_id
  const newChatters: { id: string; display_name: string; active: boolean; access_revoked: boolean }[] = []
  const newAliases: { chatter_id: string; raw_label: string; raw_label_norm: string; source: string }[] = []
  for (const raw of rawNames) {
    if (!raw) continue
    const norm = normLabel(raw)
    let cid = aliasToChatter.get(norm) ?? nameToChatter.get(raw)
    if (!cid) {
      cid = randomUUID()
      newChatters.push({ id: cid, display_name: raw, active: true, access_revoked: false })
      nameToChatter.set(raw, cid)
    }
    if (!aliasToChatter.has(norm)) {
      newAliases.push({ chatter_id: cid, raw_label: raw, raw_label_norm: norm, source: 'scrape' })
      aliasToChatter.set(norm, cid)
    }
    resolved.set(raw, cid)
  }
  if (newChatters.length) {
    const { error } = await db.from('chatters').insert(newChatters)
    if (error) throw error
  }
  if (newAliases.length) {
    const { error } = await db.from('chatter_alias').upsert(newAliases, { onConflict: 'raw_label' })
    if (error) throw error
  }

  // chatter_daily — agrégé par chatter_id (deux lignes résumé peuvent viser le même chatteur
  // via une variante de label). ca = ppv + tips → respecte le CHECK.
  const cdAgg = new Map<
    string,
    { ppv: number; tips: number; propose: number; vendu: number; pa: number; pi: number; react: number[] }
  >()
  for (const c of mt.chatters) {
    const cid = resolved.get(c.name.trim())
    if (!cid) continue
    const a = cdAgg.get(cid) ?? { ppv: 0, tips: 0, propose: 0, vendu: 0, pa: 0, pi: 0, react: [] }
    a.ppv += c.caPpv
    a.tips += c.caTips
    a.propose += c.propose
    a.vendu += c.vendu
    a.pa += c.presenceActiveH
    a.pi += c.presenceIdleH
    if (c.reactiviteSec != null) a.react.push(c.reactiviteSec)
    cdAgg.set(cid, a)
  }
  const cdRows = [...cdAgg.entries()].map(([chatter_id, a]) => {
    const ppv = round(a.ppv)
    const tips = round(a.tips)
    return {
      chatter_id,
      date: day,
      ca: round(ppv + tips),
      ca_ppv: ppv,
      ca_tips: tips,
      propose: a.propose,
      vendu: a.vendu,
      presence_active_h: round(a.pa),
      presence_idle_h: round(a.pi),
      reactivite_sec: a.react.length
        ? Math.round(a.react.reduce((s, x) => s + x, 0) / a.react.length)
        : null,
    }
  })
  // Remplacement par jour : chatter_daily reflète UNIQUEMENT le scrape courant (supprime les
  // lignes d'un mapping/roster antérieur). Gardé par length → un scrape vide ne vide rien.
  if (cdRows.length) {
    const del = await db.from('chatter_daily').delete().eq('date', day)
    if (del.error) throw del.error
    const { error } = await db.from('chatter_daily').insert(cdRows)
    if (error) throw error
  }

  // chatter_creator_daily : agrège les transactions par (chatteur, modèle).
  const pair = new Map<
    string,
    { chatter_id: string; creator_id: string; ca: number; ppv: number; tips: number; vendu: number }
  >()
  for (const t of mt.transactions) {
    const cid = resolved.get(t.chatter.trim())
    const cname = pseudoToName(t.creator)
    const crid = cname ? nameToId.get(cname) : undefined
    if (!cid || !crid) continue
    const key = `${cid}|${crid}`
    const p = pair.get(key) ?? { chatter_id: cid, creator_id: crid, ca: 0, ppv: 0, tips: 0, vendu: 0 }
    p.ca += t.amount
    if (t.type === 'Média privé') {
      p.ppv += t.amount
      p.vendu += 1
    } else if (t.type === 'Pourboires') p.tips += t.amount
    pair.set(key, p)
  }
  const ccdRows = [...pair.values()].map((p) => ({
    chatter_id: p.chatter_id,
    creator_id: p.creator_id,
    date: day,
    ca: round(p.ca),
    ca_ppv: round(p.ppv),
    ca_tips: round(p.tips),
    propose: 0,
    vendu: p.vendu,
  }))
  if (ccdRows.length) {
    const del = await db.from('chatter_creator_daily').delete().eq('date', day)
    if (del.error) throw del.error
    const { error } = await db.from('chatter_creator_daily').insert(ccdRows)
    if (error) throw error
  }
  console.log(`[ingestion] ${day}: money-team → ${cdRows.length} chatteurs, ${ccdRows.length} paires`)
}

/**
 * `creator_daily` d'un jour : dashboard prioritaire (CA complet ventilé + abonnés),
 * `/team/money` (API) en fallback par modèle. Union des modèles vus par les deux sources.
 */
async function ingestCreatorDay(
  db: Db,
  day: string,
  dash: Map<string, Map<string, DashDay>> | null,
  nameToId: Map<string, string>,
  pseudoToName: (p: string) => string | null,
): Promise<void> {
  const tx = await fetchTeamMoney(day)
  const agg = new Map<string, { ca: number; ppv: number; tips: number; renew: number }>()
  for (const t of tx) {
    const name = pseudoToName(t.creator)
    if (!name) continue
    const a = agg.get(name) ?? { ca: 0, ppv: 0, tips: 0, renew: 0 }
    const amt = Number(t.amount) || 0
    a.ca += amt
    if (t.type === 'Média privé') a.ppv += amt
    else if (t.type === 'Pourboires') a.tips += amt
    else if (t.type === 'Renouvellement abonnement') a.renew += amt
    agg.set(name, a)
  }
  const dd = dash?.get(day)
  const names = new Set([...agg.keys(), ...(dd?.keys() ?? [])])
  const rows = [...names]
    .filter((n) => nameToId.has(n))
    .map((n) => {
      const a = agg.get(n)
      const d = dd?.get(n)
      return {
        creator_id: nameToId.get(n)!,
        date: day,
        ca: round(d ? d.ca : (a?.ca ?? 0)),
        ca_ppv: round(d ? d.ppv : (a?.ppv ?? 0)),
        ca_tips: round(d ? d.tips : (a?.tips ?? 0)),
        ca_renew: round(d ? d.renew : (a?.renew ?? 0)),
        subs_active: d?.subsActive ?? 0,
        new_subs: d?.newSubs ?? 0,
        renew_subs: d?.renewals ?? 0,
      }
    })
  if (rows.length) {
    const { error } = await db.from('creator_daily').upsert(rows, { onConflict: 'creator_id,date' })
    if (error) throw error
  }
  const subsTotal = rows.reduce((s, r) => s + r.new_subs, 0)
  console.log(
    `[ingestion] ${day}: ${tx.length} tx → ${rows.length} modèles (${dd ? 'dashboard' : 'api'}, +${subsTotal} subs)`,
  )
}

export async function runPipeline(explicitDay?: string, deps: PipelineDeps = {}): Promise<void> {
  const fetchMoneyTeam = deps.fetchMoneyTeam ?? fetchMoneyTeamDay
  const db = createAdminClient()

  const { data: creators, error } = await db
    .from('creators')
    .select('id, name, is_private, mypuls_creator_id')
  if (error) throw error
  const nameToId = new Map((creators ?? []).map((c) => [c.name as string, c.id as string]))
  const mains = (creators ?? []).filter((c) => !c.is_private).map((c) => c.name as string)
  const pseudoToName = (pseudo: string): string | null => {
    const p = (pseudo || '').toLowerCase()
    return PRIV[p] ?? mains.find((n) => p.includes(n.toLowerCase())) ?? null
  }

  // Résolution modèle : par mypuls_creator_id (déterministe) sinon par pseudo (fallback) + backfill
  // de l'id → dès le 2e run le mapping est stable même si le pseudo affiché change.
  const idToName = new Map<string, string>()
  for (const c of creators ?? []) {
    if (c.mypuls_creator_id) idToName.set(c.mypuls_creator_id, c.name as string)
  }
  const creatorBackfill = new Map<string, string>() // nom modèle → mypuls_creator_id à persister
  const resolveCreator = (creatorId: number, label: string): string | null => {
    const byId = idToName.get(String(creatorId))
    if (byId) return byId
    const byName = pseudoToName(label)
    if (byName && nameToId.has(byName) && !idToName.has(String(creatorId))) {
      creatorBackfill.set(byName, String(creatorId))
    }
    return byName
  }

  // Session web pour l'attribution par chatteur (dashboard money-team). Optionnelle :
  // si le login échoue, on ingère quand même creator_daily (API) sans casser le run.
  let cookie: string | null = null
  try {
    cookie = (await login()).cookie
  } catch (e) {
    console.warn('[ingestion] login money-team échoué → chatteurs ignorés :', (e as Error).message)
  }
  const { data: chatterRows } = await db.from('chatters').select('id, display_name')
  const nameToChatter = new Map<string, string>()
  for (const c of chatterRows ?? []) if (c.display_name) nameToChatter.set(c.display_name.trim(), c.id)
  const { data: aliasRows } = await db.from('chatter_alias').select('chatter_id, raw_label_norm')
  const aliasToChatter = new Map<string, string>()
  for (const a of aliasRows ?? []) aliasToChatter.set(a.raw_label_norm, a.chatter_id)

  const today = iso(new Date())
  const yesterday = addDays(today, -1)
  let days: string[]
  if (explicitDay) {
    days = [explicitDay]
  } else {
    const { data: mx } = await db
      .from('creator_daily')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
    const last = (mx?.[0]?.date as string | undefined) ?? undefined
    // Re-capture depuis le dernier jour connu (souvent partiel → complété) jusqu'à aujourd'hui.
    const start = last ?? yesterday
    const all: string[] = []
    for (let d = start; d <= today; d = addDays(d, 1)) all.push(d)
    days = all.slice(-MAX_CATCHUP)
  }

  // Séries dashboard (CA ventilé + abonnés) en une passe pour toute la fenêtre.
  const [first, last] = [days[0], days[days.length - 1]]
  let dash: Map<string, Map<string, DashDay>> | null = null
  if (cookie && first && last) {
    try {
      dash = await fetchDashboardRange(first, last, cookie, resolveCreator)
      console.log(`[ingestion] dashboard: séries ${first} → ${last} OK`)
      // Persiste les ids résolus par fallback pseudo → runs suivants déterministes.
      for (const [name, mypulsId] of creatorBackfill) {
        const id = nameToId.get(name)
        if (!id) continue
        await db.from('creators').update({ mypuls_creator_id: mypulsId }).eq('id', id).is('mypuls_creator_id', null)
        idToName.set(mypulsId, name)
      }
      if (creatorBackfill.size) {
        console.log(`[ingestion] mypuls_creator_id backfill : ${creatorBackfill.size} modèle(s)`)
      }
    } catch (e) {
      console.warn('[ingestion] dashboard indisponible → fallback /team/money :', (e as Error).message)
    }
  }

  for (const day of days) {
    // Un jour qui échoue (429/500, session…) ne doit pas avorter le rattrapage des autres.
    try {
      await ingestCreatorDay(db, day, dash, nameToId, pseudoToName)
      if (cookie)
        await ingestChatterDay(db, day, cookie, nameToChatter, aliasToChatter, nameToId, pseudoToName, fetchMoneyTeam)
    } catch (e) {
      console.warn(`[ingestion] jour ${day} échoué (ignoré, on continue) :`, (e as Error).message)
    }
  }
}
