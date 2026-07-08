import { createAdminClient } from '@glagency/db'

/**
 * Pipeline MARKETING-TELEGRAM : canaux Telegram → mkt_social_daily, via les pages
 * PUBLIQUES `t.me/s/<canal>` (aucun compte, aucun token, gratuit — Telegram publie
 * ces pages exprès). Un relevé par nuit (23h50 UTC, invocation cron dédiée) :
 *   - membres = compteur « subscribers » de l'en-tête (→ colonne followers)
 *   - views_total = Σ vues des ~20 derniers posts affichés ; vues 24 h = delta vs la
 *     veille (clampé ≥ 0 — même convention que le pipeline Instagram)
 * Statuts : ok · privé (t.me/s/ redirige vers l'aperçu sans posts) · introuvable.
 *
 * Les canaux à suivre = mkt_social_accounts (platform 'telegram', handle = @nom
 * public sans le @). Aucun canal déclaré → run no-op (ok).
 * Parsing par regex volontairement : la page est simple (spans dédiés) et le module
 * reste exécutable en local (Node) comme dans le Worker.
 */

export interface TelegramRunSummary {
  status: 'ok' | 'degraded'
  channels: number
  scraped: number
  missing: string[]
  updatedDaily: number
  warnings: string[]
}

/** « 12.3K subscribers » / « 1 234 » → entier. */
export function parseCount(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, '').toLowerCase()
  const m = /^([\d.,]+)([km]?)$/.exec(s)
  if (!m) return null
  const base = Number((m[1] ?? '').replace(',', '.'))
  if (Number.isNaN(base)) return null
  const mult = m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : 1
  return Math.round(base * mult)
}

export interface ChannelStats {
  members: number | null
  viewsTotal: number
  status: 'ok' | 'privé' | 'introuvable'
}

/** Extrait membres + vues de la page t.me/s/<handle>. */
export function parseChannelPage(html: string): ChannelStats {
  // Canal public avec aperçu : compteurs « subscribers » dans l'en-tête.
  const sub =
    /<span class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">subscribers?<\/span>/i.exec(html)
  // Vues par post : <span class="tgme_widget_message_views">1.2K</span>
  const views = [...html.matchAll(/tgme_widget_message_views[^>]*>([^<]+)</g)]
    .map((m) => parseCount(m[1] ?? ''))
    .filter((v): v is number => v != null)
  const hasPosts = html.includes('tgme_widget_message_wrap')
  if (!sub && !hasPosts) {
    // Page d'aperçu simple (canal privé ou sans préview) ou canal inexistant.
    const anyMembers = /<div class="tgme_page_extra">([^<]*(?:subscribers?|members?)[^<]*)<\/div>/i.exec(html)
    if (anyMembers) {
      return { members: parseCount((anyMembers[1] ?? '').replace(/(subscribers?|members?)/i, '').trim()), viewsTotal: 0, status: 'privé' }
    }
    return { members: null, viewsTotal: 0, status: 'introuvable' }
  }
  return {
    members: sub ? parseCount(sub[1] ?? '') : null,
    viewsTotal: views.reduce((s, v) => s + v, 0),
    status: 'ok',
  }
}

export async function runMarketingTelegram(): Promise<TelegramRunSummary> {
  const db = createAdminClient()
  const warnings: string[] = []
  const missing: string[] = []
  const date = new Date().toISOString().slice(0, 10)

  const { data: channels, error: cErr } = await db
    .from('mkt_social_accounts')
    .select('id, handle')
    .eq('platform', 'telegram')
    .eq('active', true)
  if (cErr) throw new Error(`mkt_social_accounts : ${cErr.message}`)
  if (!channels?.length) {
    return { status: 'ok', channels: 0, scraped: 0, missing: [], updatedDaily: 0, warnings }
  }

  const { data: prevRows } = await db
    .from('mkt_social_daily')
    .select('account_id, date, followers, views_total')
    .in('account_id', channels.map((c) => c.id))
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1000)
  const prev = new Map<string, { followers: number | null; viewsTotal: number | null }>()
  for (const r of prevRows ?? []) {
    if (!prev.has(r.account_id)) prev.set(r.account_id, { followers: r.followers, viewsTotal: r.views_total })
  }

  const rows: {
    account_id: string
    date: string
    followers: number | null
    delta_followers: number | null
    views_24h: number | null
    views_total: number | null
    status: string
  }[] = []
  let scraped = 0
  for (const ch of channels) {
    try {
      const r = await fetch(`https://t.me/s/${encodeURIComponent(ch.handle)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
        redirect: 'follow',
      })
      if (!r.ok) throw new Error(`t.me ${r.status}`)
      const stats = parseChannelPage(await r.text())
      const before = prev.get(ch.id)
      rows.push({
        account_id: ch.id,
        date,
        followers: stats.members,
        delta_followers:
          stats.members != null && before?.followers != null ? stats.members - before.followers : null,
        views_24h:
          stats.status === 'ok' && before?.viewsTotal != null
            ? Math.max(0, stats.viewsTotal - before.viewsTotal)
            : null,
        views_total: stats.status === 'ok' ? stats.viewsTotal : null,
        status: stats.status,
      })
      if (stats.status !== 'introuvable') scraped++
      else missing.push(ch.handle)
    } catch (e) {
      missing.push(ch.handle)
      warnings.push(`${ch.handle} : ${(e as Error).message}`)
    }
  }

  if (rows.length) {
    const { error } = await db.from('mkt_social_daily').upsert(rows, { onConflict: 'account_id,date' })
    if (error) throw new Error(`mkt_social_daily : ${error.message}`)
  }
  if (missing.length) warnings.push(`introuvables : ${missing.join(', ')}`)

  return {
    status: warnings.length ? 'degraded' : 'ok',
    channels: channels.length,
    scraped,
    missing,
    updatedDaily: rows.length,
    warnings,
  }
}
