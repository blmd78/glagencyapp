import { randomUUID } from 'node:crypto'
import {
  fetchTeamMoney,
  fetchMoneyTeamDay,
  fetchDashboardStats,
  fetchDashboardSubscriptions,
  login,
} from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'

type Db = ReturnType<typeof createAdminClient>

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
  pseudoToName: (p: string) => string | null,
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
    const name = pseudoToName(ds.label)
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
    const name = pseudoToName(ds.label)
    if (!name) continue
    subs.labels.forEach((date, i) => {
      const e = entry(date, name)
      e.newSubs += ds.data[i] ?? 0
      e.renewals += ds.renewals?.[i] ?? 0
    })
  }
  for (const ds of subs.totalSubsDatasets) {
    const name = pseudoToName(ds.label)
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
  chatterId: Map<string, string>,
  nameToId: Map<string, string>,
  pseudoToName: (p: string) => string | null,
): Promise<void> {
  const mt = await fetchMoneyTeamDay(day, cookie)

  // Crée les chatteurs inconnus (résumé + détail).
  const names = new Set<string>()
  for (const c of mt.chatters) if (c.name) names.add(c.name.trim())
  for (const t of mt.transactions) if (t.chatter) names.add(t.chatter.trim())
  const missing = [...names].filter((n) => n && !chatterId.has(n))
  if (missing.length) {
    const toInsert = missing.map((n) => ({
      id: randomUUID(),
      display_name: n,
      active: true,
      access_revoked: false,
    }))
    const { error } = await db.from('chatters').insert(toInsert)
    if (error) throw error
    for (const r of toInsert) chatterId.set(r.display_name, r.id)
  }

  // chatter_daily (ca = ppv + tips → respecte le CHECK).
  const cdRows = mt.chatters
    .map((c) => {
      const ppv = round(c.caPpv)
      const tips = round(c.caTips)
      return {
        chatter_id: chatterId.get(c.name.trim())!,
        date: day,
        ca: round(ppv + tips),
        ca_ppv: ppv,
        ca_tips: tips,
        propose: c.propose,
        vendu: c.vendu,
        presence_active_h: round(c.presenceActiveH),
        presence_idle_h: round(c.presenceIdleH),
        reactivite_sec: c.reactiviteSec,
      }
    })
    .filter((r) => r.chatter_id)
  if (cdRows.length) {
    const { error } = await db.from('chatter_daily').upsert(cdRows, { onConflict: 'chatter_id,date' })
    if (error) throw error
  }

  // chatter_creator_daily : agrège les transactions par (chatteur, modèle).
  const pair = new Map<
    string,
    { chatter_id: string; creator_id: string; ca: number; ppv: number; tips: number; vendu: number }
  >()
  for (const t of mt.transactions) {
    const cid = chatterId.get(t.chatter.trim())
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
    const { error } = await db
      .from('chatter_creator_daily')
      .upsert(ccdRows, { onConflict: 'chatter_id,creator_id,date' })
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

export async function runPipeline(explicitDay?: string): Promise<void> {
  const db = createAdminClient()

  const { data: creators, error } = await db.from('creators').select('id, name, is_private')
  if (error) throw error
  const nameToId = new Map((creators ?? []).map((c) => [c.name as string, c.id as string]))
  const mains = (creators ?? []).filter((c) => !c.is_private).map((c) => c.name as string)
  const pseudoToName = (pseudo: string): string | null => {
    const p = (pseudo || '').toLowerCase()
    return PRIV[p] ?? mains.find((n) => p.includes(n.toLowerCase())) ?? null
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
  const chatterId = new Map<string, string>()
  for (const c of chatterRows ?? []) if (c.display_name) chatterId.set(c.display_name.trim(), c.id)

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
      dash = await fetchDashboardRange(first, last, cookie, pseudoToName)
      console.log(`[ingestion] dashboard: séries ${first} → ${last} OK`)
    } catch (e) {
      console.warn('[ingestion] dashboard indisponible → fallback /team/money :', (e as Error).message)
    }
  }

  for (const day of days) {
    // Un jour qui échoue (429/500, session…) ne doit pas avorter le rattrapage des autres.
    try {
      await ingestCreatorDay(db, day, dash, nameToId, pseudoToName)
      if (cookie) await ingestChatterDay(db, day, cookie, chatterId, nameToId, pseudoToName)
    } catch (e) {
      console.warn(`[ingestion] jour ${day} échoué (ignoré, on continue) :`, (e as Error).message)
    }
  }
}
