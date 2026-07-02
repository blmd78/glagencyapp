import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fetchTeamMoney, fetchMoneyTeamDay, login } from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'

type Db = ReturnType<typeof createAdminClient>

/**
 * Pipeline quotidien : /team/money (par jour) → agrégation par modèle → upsert creator_daily.
 * Idempotent (upsert `creator_id,date`). Auto-cicatrisant : sans argument, rattrape les jours
 * complets manquants (max(date)+1 → hier) + capture aujourd'hui (partiel, complété demain).
 * Écrit aussi le brut dans apps/ingestion/raw/<date>.json.
 *
 * Attribution par chatteur : depuis le dashboard money-team (session web, l'API ne donne
 * pas l'expéditeur) → chatter_daily + chatter_creator_daily. Cf. ingestChatterDay.
 *
 * TODO (suite) : new_subs/subs_active via /creators/{id}/stats ; runRules → insights.
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

export async function runPipeline(explicitDay?: string): Promise<void> {
  const db = createAdminClient()
  const rawDir = resolve(dirname(fileURLToPath(import.meta.url)), '../raw')

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

  for (const day of days) {
    const tx = await fetchTeamMoney(day)
    mkdirSync(rawDir, { recursive: true })
    writeFileSync(
      resolve(rawDir, `${day}.json`),
      JSON.stringify({ date: day, count: tx.length, tx }, null, 1),
    )

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
    const rows = [...agg]
      .filter(([n]) => nameToId.has(n))
      .map(([n, a]) => ({
        creator_id: nameToId.get(n)!,
        date: day,
        ca: round(a.ca),
        ca_ppv: round(a.ppv),
        ca_tips: round(a.tips),
        ca_renew: round(a.renew),
        subs_active: 0,
        new_subs: 0,
      }))
    if (rows.length) {
      const { error: upErr } = await db
        .from('creator_daily')
        .upsert(rows, { onConflict: 'creator_id,date' })
      if (upErr) throw upErr
    }
    console.log(`[ingestion] ${day}: ${tx.length} tx → ${rows.length} modèles`)

    if (cookie) {
      try {
        await ingestChatterDay(db, day, cookie, chatterId, nameToId, pseudoToName)
      } catch (e) {
        console.warn(`[ingestion] money-team ${day} échoué :`, (e as Error).message)
      }
    }
  }
}
