import { createAdminClient, fetchAll } from '@glagency/db'
import {
  addDays,
  chunk,
  parseLinkscaleDay,
  planLinkscaleWrite,
  todayParis,
  type LsDayLine,
  type LsKind,
  type LsListedLink,
} from '@glagency/core'

/**
 * Pipeline MARKETING-LINKSCALE : trafic des liens de bio LinkScale → mkt_ls_links / mkt_ls_daily
 * (spec docs/superpowers/specs/2026-09-30-trafic-linkscale-design.md). Clé de projet en LECTURE
 * seule (`LINKSCALE_API_KEY`) : rien n'est jamais écrit chez LinkScale.
 *
 * Chaque nuit, en fan-out du cron de 23h05 UTC (`?job=linkscale`, aucun slot cron) :
 *   1. dossiers + liste des liens (type, dossiers, destination) ;
 *   2. un appel stats PAR JOUR — `dailyTraffic` revient vide, seul `trafficByUrls` porte le détail ;
 *      J-2 et J-1 à Paris (le cron tourne après minuit, heure de Paris) ;
 *   3. plan pur (`planLinkscaleWrite`) : attribution des liens non corrigés à la main ;
 *   4. upsert des liens, puis des lignes du jour.
 *
 * Budget sous-requêtes (Worker Free, 50/invocation) : 1 dossiers + ~7 pages de liens + 2 stats +
 * 3 lectures + 2 upserts ≈ 15. LinkScale limite à 2 requêtes/s : pause entre deux appels.
 */

export interface LinkscaleRunSummary {
  status: 'ok' | 'degraded'
  days: string[]
  links: number
  dailyRows: number
  /** Liens vus sur la fenêtre, sans modèle attribuée. */
  unattributed: number
  warnings: string[]
}

const LS_API = 'https://dashboard.linkscale.to/api/v1'
const PAGE = 50
const MAX_PAGES = 20
const PAUSE_MS = 600
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function lsGet(path: string, key: string): Promise<unknown> {
  const r = await fetch(`${LS_API}${path}`, { headers: { Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`LinkScale ${path.split('?')[0]} : HTTP ${r.status}`)
  return r.json()
}

/** J-2 et J-1 à Paris : J-1 vient de se terminer quand le cron tourne. */
export function defaultDays(today: string = todayParis()): string[] {
  return [addDays(today, -2), addDays(today, -1)]
}

export async function runMarketingLinkscale(opts: { days?: string[] } = {}): Promise<LinkscaleRunSummary> {
  const warnings: string[] = []
  const days = [...(opts.days ?? defaultDays())].sort()
  const summary = (status: 'ok' | 'degraded'): LinkscaleRunSummary => ({
    status,
    days,
    links: 0,
    dailyRows: 0,
    unattributed: 0,
    warnings,
  })
  const key = process.env.LINKSCALE_API_KEY
  if (!key) {
    warnings.push('LINKSCALE_API_KEY absente — relevé LinkScale non lancé (secret Cloudflare / .env)')
    return summary('degraded')
  }

  // 1. Dossiers (id → nom) et liste des liens.
  const folderRes = (await lsGet('/folders', key)) as { folders?: { _id: string; name: string }[] }
  const folderNames: Record<string, string> = {}
  for (const f of folderRes.folders ?? []) folderNames[f._id] = f.name.trim()
  const listed: LsListedLink[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    await sleep(PAUSE_MS)
    const res = (await lsGet(`/links?limit=${PAGE}&offset=${page * PAGE}`, key)) as {
      links?: LsListedLink[]
      pagination?: { has_more?: boolean }
    }
    listed.push(...(res.links ?? []))
    if (!res.pagination?.has_more) break
    if (page === MAX_PAGES - 1) warnings.push(`liste des liens tronquée à ${MAX_PAGES * PAGE}`)
  }

  // 2. Un appel stats par jour.
  const byDay: { date: string; lines: LsDayLine[] }[] = []
  for (const date of days) {
    await sleep(PAUSE_MS)
    const q = `from=${date}&to=${addDays(date, 1)}&timezone=Europe/Paris&include_clicks=true`
    byDay.push({ date, lines: parseLinkscaleDay(await lsGet(`/stats?${q}`, key)) })
  }

  // 3. Références CRM + liens déjà connus (pour préserver les corrections manuelles).
  const db = createAdminClient()
  const [creatorsRes, accountsRes, knownRes] = await Promise.all([
    db.from('creators').select('id, name'),
    db.from('mkt_social_accounts').select('id, handle, creator_id').eq('platform', 'instagram'),
    fetchAll((f, t) =>
      db
        .from('mkt_ls_links')
        .select('id, ls_id, manual, creator_id, platform, social_account_id, operator, first_seen, last_seen, url, note, folders, kind, destination')
        .order('id')
        .range(f, t),
    ),
  ])
  if (creatorsRes.error) throw new Error(`creators : ${creatorsRes.error.message}`)
  if (accountsRes.error) throw new Error(`mkt_social_accounts : ${accountsRes.error.message}`)
  if (knownRes.error) throw new Error(`mkt_ls_links lecture : ${knownRes.error.message}`)

  const plan = planLinkscaleWrite({
    days: byDay,
    listed,
    folderNames,
    creators: (creatorsRes.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    accounts: (accountsRes.data ?? []).map((a) => ({ id: a.id, handle: a.handle, creatorId: a.creator_id })),
    known: knownRes.data.map((k) => ({
      lsId: k.ls_id,
      manual: k.manual,
      creatorId: k.creator_id,
      platform: k.platform,
      socialAccountId: k.social_account_id,
      operator: k.operator,
      firstSeen: k.first_seen,
      lastSeen: k.last_seen,
      url: k.url,
      note: k.note,
      folders: k.folders,
      kind: k.kind as LsKind,
      destination: k.destination,
    })),
  })

  // 4. Liens (on récupère leur uuid), puis lignes du jour.
  const idByLs = new Map<string, string>()
  for (const part of chunk(plan.links, 500)) {
    const { data, error } = await db.from('mkt_ls_links').upsert(part, { onConflict: 'ls_id' }).select('id, ls_id')
    if (error) throw new Error(`mkt_ls_links : ${error.message}`)
    for (const r of data ?? []) idByLs.set(r.ls_id, r.id)
  }
  const daily = plan.daily.flatMap((d) => {
    const linkId = idByLs.get(d.lsId)
    if (!linkId) {
      warnings.push(`ligne du ${d.date} sans lien écrit (${d.lsId})`)
      return []
    }
    return [{ link_id: linkId, date: d.date, visitors: d.visitors, bots: d.bots, mym_clicks: d.mym_clicks }]
  })
  for (const part of chunk(daily, 500)) {
    const { error } = await db.from('mkt_ls_daily').upsert(part, { onConflict: 'link_id,date' })
    if (error) throw new Error(`mkt_ls_daily : ${error.message}`)
  }

  const seen = new Set(plan.daily.map((d) => d.lsId))
  return {
    status: warnings.length ? 'degraded' : 'ok',
    days,
    links: plan.links.length,
    dailyRows: daily.length,
    unattributed: plan.links.filter((l) => seen.has(l.ls_id) && !l.creator_id).length,
    warnings,
  }
}
