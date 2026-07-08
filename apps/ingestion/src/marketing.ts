import { login, BASE_URL, UA } from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'

/**
 * Pipeline MARKETING : liens de tracking MyPuls → mkt_links / mkt_link_daily.
 *
 * Source : `GET /tracking-stats/data` (JSON) après `GET /switch-creator/{id}` — même
 * session web que l'ingestion chatteurs. Le payload contient la série `daily` PAR JOUR
 * et par lien depuis l'origine (13/02) : on stocke ce par-jour tel quel (aucun delta à
 * dériver — les cumuls, on les fait nous-mêmes côté app), la série `cumulative` ne sert
 * qu'à rafraîchir le cache cum_* des liens (vérifications d'exactitude).
 *
 * Chaque nuit : réécrit une fenêtre glissante de 8 jours (idempotent) — la journée en
 * cours, partielle au moment du run, est finalisée par le run suivant, et un cron raté
 * est rattrapé sans rien perdre. `backfillFrom` (usage CLI local) réécrit depuis une
 * date arbitraire (import initial : 2026-06-01, raccord avec l'historique chatteurs).
 *
 * Clé des liens = (mypuls_creator_id, name) : les noms ne sont uniques QUE par
 * créatrice. Le type n'est détecté qu'à la CRÉATION (corrections manuelles préservées).
 *
 * Budget sous-requêtes (plan Free : 50/invocation) : login 2 + 16 × 2 (switch + data)
 * + ~8 Supabase ≈ 44 → invocation cron dédiée (23h20 UTC), séparée du run chatteurs.
 */

export interface MarketingRunSummary {
  status: 'ok' | 'degraded'
  creators: number
  creatorsFailed: string[]
  links: number
  newLinks: number
  updatedDaily: number
  from: string
  warnings: string[]
}

interface TrackingPoint {
  revenue?: number
  clicks?: number
  conversions?: number
}
interface TrackingDataset {
  label: string
  data: TrackingPoint[]
}
interface TrackingData {
  labels: string[]
  cumulative?: TrackingDataset[]
  daily?: TrackingDataset[]
}

// Portage des règles de typage du scraper Python (+ canal telegram, absent du legacy).
const TG_RE = /_tg($|_)|telegram|^tel[a-z]/i
const OTHER_RE = /trafficstar|subs_test/i
const TW_RE = /twitter|^tw[a-z_]|^roro|^keller|^ara[a-z]/i
const IG_RE = /insta|threads/i
export function detectLinkType(name: string): 'twitter' | 'instagram' | 'telegram' | 'other' {
  if (TG_RE.test(name)) return 'telegram'
  if (OTHER_RE.test(name)) return 'other'
  if (TW_RE.test(name)) return 'twitter'
  if (IG_RE.test(name)) return 'instagram'
  return 'other'
}

const r2 = (v: number) => Math.round(v * 100) / 100
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export async function runMarketing(opts: { backfillFrom?: string } = {}): Promise<MarketingRunSummary> {
  const db = createAdminClient()
  const from = opts.backfillFrom ?? isoDaysAgo(8)
  const warnings: string[] = []
  const creatorsFailed: string[] = []

  const [{ data: creators, error: cErr }, { data: links, error: lErr }] = await Promise.all([
    db.from('creators').select('id, name, mypuls_creator_id').not('mypuls_creator_id', 'is', null),
    db.from('mkt_links').select('id, name, mypuls_creator_id'),
  ])
  if (cErr || lErr) throw new Error(`marketing : lecture DB impossible (${cErr?.message ?? lErr?.message})`)
  const keyOf = (mp: string | null, name: string) => `${mp ?? ''}::${name}`
  const linkIdByKey = new Map((links ?? []).map((l) => [keyOf(l.mypuls_creator_id, l.name), l.id]))

  const { cookie } = await login()
  const headers = { Cookie: cookie, 'User-Agent': UA, Accept: 'application/json' }

  // Scrape séquentiel (6 connexions simultanées max sur Workers).
  const byCreator = new Map<string, { creatorId: string; data: TrackingData }>()
  for (const c of creators ?? []) {
    try {
      const sw = await fetch(`${BASE_URL}/switch-creator/${c.mypuls_creator_id}`, { headers, redirect: 'follow' })
      if (!sw.ok) throw new Error(`switch ${sw.status}`)
      const r = await fetch(`${BASE_URL}/tracking-stats/data`, { headers })
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) {
        throw new Error(`data ${r.status}${r.url.includes('/login') ? ' (session expirée)' : ''}`)
      }
      const data = (await r.json()) as TrackingData | unknown[]
      // Compte sans aucun lien de tracking (les privés) : MyPuls renvoie `[]` — cas normal.
      if (Array.isArray(data)) continue
      if (!Array.isArray(data.labels) || !Array.isArray(data.daily)) {
        throw new Error('payload inattendu (labels/daily absents)')
      }
      byCreator.set(String(c.mypuls_creator_id), { creatorId: c.id, data })
    } catch (e) {
      creatorsFailed.push(c.name)
      warnings.push(`${c.name} : ${(e as Error).message}`)
    }
  }
  if (byCreator.size === 0) throw new Error(`marketing : aucune créatrice lue (${warnings.join(' | ')})`)

  // Nouveaux liens (type détecté UNIQUEMENT ici — les corrections manuelles restent).
  const newRows: { name: string; type: string; mypuls_creator_id: string; creator_id: string; active: boolean }[] = []
  for (const [mp, { creatorId, data }] of byCreator) {
    for (const ds of data.daily ?? []) {
      if (!ds.label || linkIdByKey.has(keyOf(mp, ds.label))) continue
      if (!newRows.some((n) => n.mypuls_creator_id === mp && n.name === ds.label)) {
        newRows.push({
          name: ds.label,
          type: detectLinkType(ds.label),
          mypuls_creator_id: mp,
          creator_id: creatorId,
          active: true,
        })
      }
    }
  }
  if (newRows.length) {
    const { error } = await db.from('mkt_links').upsert(newRows, { onConflict: 'mypuls_creator_id,name' })
    if (error) throw new Error(`mkt_links insert : ${error.message}`)
    const { data: refreshed, error: rErr } = await db.from('mkt_links').select('id, name, mypuls_creator_id')
    if (rErr || !refreshed) throw new Error(`mkt_links relecture : ${rErr?.message}`)
    linkIdByKey.clear()
    for (const l of refreshed) linkIdByKey.set(keyOf(l.mypuls_creator_id, l.name), l.id)
  }

  // Par-jour DEPUIS LA SOURCE (fenêtre [from, aujourd'hui]) — écrit tel quel, lignes vides ignorées.
  const today = new Date().toISOString().slice(0, 10)
  const daily: { link_id: string; date: string; clicks: number; conversions: number; revenue_eur: number }[] = []
  const cumUpdates: {
    id: string
    name: string
    mypuls_creator_id: string | null
    cum_clicks: number
    cum_conversions: number
    cum_revenue_eur: number
    last_seen: string
    active: boolean
  }[] = []
  for (const [mp, { data }] of byCreator) {
    const lastIdx = data.labels.length - 1
    const cumulByName = new Map((data.cumulative ?? []).map((ds) => [ds.label, ds.data[lastIdx] ?? {}]))
    for (const ds of data.daily ?? []) {
      const id = linkIdByKey.get(keyOf(mp, ds.label))
      if (!id) continue
      for (let i = 0; i < data.labels.length; i++) {
        const date = data.labels[i]
        if (!date || date < from) continue
        const pt = ds.data[i] ?? {}
        const clicks = pt.clicks ?? 0
        const conversions = pt.conversions ?? 0
        const revenue = r2(pt.revenue ?? 0)
        if (clicks || conversions || revenue) {
          daily.push({ link_id: id, date, clicks, conversions, revenue_eur: revenue })
        }
      }
      const cum = cumulByName.get(ds.label) ?? {}
      cumUpdates.push({
        id,
        name: ds.label,
        mypuls_creator_id: mp,
        cum_clicks: cum.clicks ?? 0,
        cum_conversions: cum.conversions ?? 0,
        cum_revenue_eur: r2(cum.revenue ?? 0),
        last_seen: today,
        active: true,
      })
    }
  }

  for (let i = 0; i < daily.length; i += 500) {
    const { error } = await db.from('mkt_link_daily').upsert(daily.slice(i, i + 500), { onConflict: 'link_id,date' })
    if (error) throw new Error(`mkt_link_daily : ${error.message}`)
  }
  if (cumUpdates.length) {
    // upsert par id : ne met à jour QUE les liens vus ce run.
    const { error } = await db.from('mkt_links').upsert(cumUpdates, { onConflict: 'id' })
    if (error) warnings.push(`cache cumuls : ${error.message}`)
  }

  return {
    status: creatorsFailed.length ? 'degraded' : 'ok',
    creators: byCreator.size,
    creatorsFailed,
    links: cumUpdates.length,
    newLinks: newRows.length,
    updatedDaily: daily.length,
    from,
    warnings,
  }
}
