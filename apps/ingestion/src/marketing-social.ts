import { createAdminClient } from '@glagency/db'

/**
 * Pipeline MARKETING-SOCIAL : comptes Instagram → mkt_social_daily, via Apify
 * (actor officiel `apify/instagram-profile-scraper`, pay-per-result ≈ 0,0026 $/profil —
 * ~51 comptes/nuit ≈ 4 $/mois, couvert par les 5 $ de crédits gratuits du plan Free).
 *
 * Un run par nuit (23h35 UTC, invocation cron dédiée) :
 *   1. lance l'actor en asynchrone sur les handles actifs, puis poll jusqu'à SUCCEEDED
 *   2. par compte : followers du jour (photo exacte), views_total = Σ vues des ~12
 *      derniers posts (cumul brut), vues 24 h = views_total − views_total de la veille
 *      (clampé ≥ 0 : la rotation des posts hors du top-12 peut faire baisser le cumul)
 *   3. delta followers = followers − dernier relevé antérieur
 * Un compte absent de la réponse (banni/supprimé/privé) → statut 'introuvable', aucun
 * chiffre inventé. La saisie manuelle (UI) reste prioritaire : on n'écrase pas une
 * ligne déjà saisie ce jour-là si l'actor n'a rien ramené de mieux (upsert = merge).
 *
 * Budget sous-requêtes : 1 start + ~40 polls max + 1 dataset + ~5 Supabase < 50/invocation.
 */

export interface SocialRunSummary {
  status: 'ok' | 'degraded'
  accounts: number
  scraped: number
  missing: string[]
  updatedDaily: number
  warnings: string[]
}

interface ApifyProfile {
  username?: string
  followersCount?: number
  private?: boolean
  latestPosts?: { videoViewCount?: number; videoPlayCount?: number; likesCount?: number }[]
}

const APIFY_BASE = 'https://api.apify.com/v2'
const ACTOR = 'apify~instagram-profile-scraper'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function runActor(token: string, usernames: string[], warnings: string[]): Promise<ApifyProfile[]> {
  const start = await fetch(`${APIFY_BASE}/acts/${ACTOR}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames }),
  })
  if (!start.ok) throw new Error(`apify start ${start.status} : ${(await start.text()).slice(0, 200)}`)
  const run = (await start.json()) as { data: { id: string; defaultDatasetId: string } }

  // Poll (15 s × 40 = 10 min max — l'actor met ~1-3 min pour ~50 profils).
  let status = 'RUNNING'
  for (let i = 0; i < 40 && (status === 'RUNNING' || status === 'READY'); i++) {
    await sleep(15_000)
    const r = await fetch(`${APIFY_BASE}/actor-runs/${run.data.id}?token=${token}`)
    if (!r.ok) throw new Error(`apify poll ${r.status}`)
    status = ((await r.json()) as { data: { status: string } }).data.status
  }
  if (status !== 'SUCCEEDED') {
    // ABORTED / FAILED / TIMED-OUT / crédits épuisés → on prend ce qui est déjà dans le dataset.
    warnings.push(`run apify terminé en ${status} (crédits épuisés ?) — résultats partiels utilisés`)
  }
  const items = await fetch(`${APIFY_BASE}/datasets/${run.data.defaultDatasetId}/items?token=${token}&clean=true`)
  if (!items.ok) throw new Error(`apify dataset ${items.status}`)
  return (await items.json()) as ApifyProfile[]
}

export async function runMarketingSocial(): Promise<SocialRunSummary> {
  const token = process.env.APIFY_TOKEN
  if (!token) throw new Error('APIFY_TOKEN manquant (secret Cloudflare / .dev.vars)')
  const db = createAdminClient()
  const warnings: string[] = []
  const date = new Date().toISOString().slice(0, 10)

  const { data: accounts, error: aErr } = await db
    .from('mkt_social_accounts')
    .select('id, handle')
    .eq('platform', 'instagram')
    .eq('active', true)
  if (aErr) throw new Error(`mkt_social_accounts : ${aErr.message}`)
  if (!accounts?.length) return { status: 'ok', accounts: 0, scraped: 0, missing: [], updatedDaily: 0, warnings }

  // Dernier relevé antérieur (delta followers + delta vues) — 1 requête, réduite en mémoire.
  const { data: prevRows, error: pErr } = await db
    .from('mkt_social_daily')
    .select('account_id, date, followers, views_total')
    .in('account_id', accounts.map((a) => a.id))
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(2000)
  if (pErr) throw new Error(`mkt_social_daily lecture : ${pErr.message}`)
  const prev = new Map<string, { followers: number | null; viewsTotal: number | null }>()
  for (const r of prevRows ?? []) {
    if (!prev.has(r.account_id)) prev.set(r.account_id, { followers: r.followers, viewsTotal: r.views_total })
  }

  const profiles = await runActor(token, accounts.map((a) => a.handle), warnings)
  const byHandle = new Map(profiles.filter((p) => p.username).map((p) => [String(p.username).toLowerCase(), p]))

  const rows: {
    account_id: string
    date: string
    followers: number | null
    delta_followers: number | null
    views_24h: number | null
    views_total: number | null
    status: string
  }[] = []
  const missing: string[] = []
  for (const acc of accounts) {
    const p = byHandle.get(acc.handle.toLowerCase())
    if (!p) {
      missing.push(acc.handle)
      rows.push({ account_id: acc.id, date, followers: null, delta_followers: null, views_24h: null, views_total: null, status: 'introuvable' })
      continue
    }
    const followers = p.followersCount ?? null
    const viewsTotal = (p.latestPosts ?? []).reduce(
      (s, post) => s + (post.videoViewCount ?? post.videoPlayCount ?? 0),
      0,
    )
    const before = prev.get(acc.id)
    rows.push({
      account_id: acc.id,
      date,
      followers,
      delta_followers: followers != null && before?.followers != null ? followers - before.followers : null,
      views_24h: before?.viewsTotal != null ? Math.max(0, viewsTotal - before.viewsTotal) : null,
      views_total: viewsTotal,
      // followersCount absent alors que le profil a répondu = compte mort/renommé.
      status: p.private ? 'privé' : followers == null ? 'introuvable' : 'ok',
    })
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('mkt_social_daily').upsert(rows.slice(i, i + 500), { onConflict: 'account_id,date' })
    if (error) throw new Error(`mkt_social_daily : ${error.message}`)
  }
  if (missing.length) warnings.push(`introuvables : ${missing.join(', ')}`)

  return {
    status: warnings.length ? 'degraded' : 'ok',
    accounts: accounts.length,
    scraped: byHandle.size,
    missing,
    updatedDaily: rows.length,
    warnings,
  }
}
