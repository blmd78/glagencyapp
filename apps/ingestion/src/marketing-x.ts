import { createAdminClient } from '@glagency/db'
import {
  X_MAX_ACCOUNTS,
  X_USER_FIELDS,
  capXAccounts,
  chunk,
  isValidXHandle,
  matchXLookup,
  xDeltas,
  type XAccountRef,
  type XLookupError,
  type XUser,
} from '@glagency/core'

/**
 * Pipeline MARKETING-X : profils des comptes X (Twitter) → mkt_social_daily, par l'API officielle
 * X v2 et un Bearer Token applicatif (spec docs/superpowers/specs/2026-09-28-comptes-x-design.md).
 *
 * Chaque nuit, en fan-out du cron de 23h05 (`?job=x`, aucun slot cron) :
 *   1. les comptes X actifs de `mkt_social_accounts` (X_MAX_ACCOUNTS au plus) ;
 *   2. lecture par identifiant X quand on l'a, sinon par pseudo — 100 comptes par requête ;
 *   3. une ligne par compte et par jour ; un compte absent de la réponse a un statut, AUCUN chiffre ;
 *   4. l'identifiant X est gardé, et un pseudo changé est mis à jour (compte renommé).
 *
 * COÛT : X facture chaque compte RENDU (0,010 $), pas la requête — `read` dans le résumé est la
 * facture du run ; relire le même compte le même jour UTC n'est pas refacturé. Sans crédits, X
 * répond 402 : le run échoue avec ce message, et rien n'est écrit.
 *
 * Budget sous-requêtes (Worker Free, 50/invocation) : 1 lecture des comptes + 1 RPC + 4 appels X au
 * plus + 1 upsert des relevés + 1 upsert des comptes.
 */

export interface XRunSummary {
  status: 'ok' | 'degraded'
  accounts: number
  /** Comptes rendus par X = comptes facturés (0,010 $ chacun). */
  read: number
  missing: string[]
  renamed: string[]
  updatedDaily: number
  warnings: string[]
}

/** Une ligne `mkt_social_daily` du relevé X (colonnes de 0018 + 0177). */
interface XDailyRow {
  account_id: string
  date: string
  followers: number | null
  delta_followers: number | null
  following: number | null
  verified_followers: number | null
  posts_total: number | null
  posts_24h: number | null
  bio_url: string | null
  last_post_at: string | null
  status: string
}

const X_API = 'https://api.x.com/2'

async function lookup(
  token: string,
  path: 'users' | 'users/by',
  param: 'ids' | 'usernames',
  values: string[],
): Promise<{ users: XUser[]; errors: XLookupError[] }> {
  const res = await fetch(`${X_API}/${path}?${param}=${values.map(encodeURIComponent).join(',')}&user.fields=${X_USER_FIELDS}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 402) throw new Error('API X : crédits épuisés (HTTP 402) — recharger sur console.x.com')
  if (!res.ok) throw new Error(`API X ${path} ${res.status} : ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { data?: XUser[]; errors?: XLookupError[] }
  return { users: body.data ?? [], errors: body.errors ?? [] }
}

export async function runMarketingX(): Promise<XRunSummary> {
  const warnings: string[] = []
  const summary = (status: 'ok' | 'degraded'): XRunSummary => ({
    status,
    accounts: 0,
    read: 0,
    missing: [],
    renamed: [],
    updatedDaily: 0,
    warnings,
  })
  const token = process.env.X_BEARER_TOKEN
  if (!token) {
    warnings.push('X_BEARER_TOKEN absent — relevé X non lancé (secret Cloudflare / .env)')
    return summary('degraded')
  }
  const db = createAdminClient()
  const date = new Date().toISOString().slice(0, 10)

  const { data: rows, error: aErr } = await db
    .from('mkt_social_accounts')
    .select('id, handle, x_user_id')
    .eq('platform', 'twitter')
    .eq('active', true)
    .order('handle')
  if (aErr) throw new Error(`mkt_social_accounts : ${aErr.message}`)
  const all: XAccountRef[] = (rows ?? []).map((r) => ({ id: r.id, handle: r.handle, xUserId: r.x_user_id }))
  if (!all.length) return summary('ok')
  const { kept: accounts, dropped } = capXAccounts(all, X_MAX_ACCOUNTS)
  if (dropped.length) {
    warnings.push(`plafond de ${X_MAX_ACCOUNTS} comptes : ${dropped.length} non relevé(s) — ${dropped.map((a) => a.handle).join(', ')}`)
  }

  const { data: prevRows, error: pErr } = await db.rpc('mkt_social_prev_snapshot', {
    account_ids: accounts.map((a) => a.id),
    before_date: date,
  })
  if (pErr) throw new Error(`mkt_social_daily lecture : ${pErr.message}`)
  const prev = new Map((prevRows ?? []).map((r) => [r.account_id, { followers: r.followers, postsTotal: r.posts_total }]))

  const users: XUser[] = []
  const errors: XLookupError[] = []
  const ids = accounts.flatMap((a) => (a.xUserId ? [a.xUserId] : []))
  const invalidHandles = accounts.flatMap((a) => (!a.xUserId && !isValidXHandle(a.handle) ? [a.handle] : []))
  if (invalidHandles.length) {
    warnings.push(`pseudo(s) invalide(s), non relevé(s) : ${invalidHandles.join(', ')}`)
  }
  const names = accounts.flatMap((a) => (!a.xUserId && isValidXHandle(a.handle) ? [a.handle] : []))
  for (const part of chunk(ids, 100)) {
    const r = await lookup(token, 'users', 'ids', part)
    users.push(...r.users)
    errors.push(...r.errors)
  }
  for (const part of chunk(names, 100)) {
    const r = await lookup(token, 'users/by', 'usernames', part)
    users.push(...r.users)
    errors.push(...r.errors)
  }

  const byAccount = new Map(accounts.map((a) => [a.id, a]))
  const daily: XDailyRow[] = []
  const accountUpdates: { id: string; platform: 'twitter'; handle: string; x_user_id: string }[] = []
  const missing: string[] = []
  const renamed: string[] = []
  for (const r of matchXLookup(accounts, users, errors)) {
    const acc = byAccount.get(r.accountId)
    if (!acc) continue
    if (r.kind === 'missing') {
      missing.push(`${acc.handle} (${r.status})`)
      daily.push({
        account_id: acc.id,
        date,
        followers: null,
        delta_followers: null,
        following: null,
        verified_followers: null,
        posts_total: null,
        posts_24h: null,
        bio_url: null,
        last_post_at: null,
        status: r.status,
      })
      continue
    }
    const s = r.snapshot
    const d = xDeltas(s, prev.get(acc.id))
    daily.push({
      account_id: acc.id,
      date,
      followers: s.followers,
      delta_followers: d.deltaFollowers,
      following: s.following,
      verified_followers: s.verifiedFollowers,
      posts_total: s.postsTotal,
      posts_24h: d.posts24h,
      bio_url: s.bioUrl,
      last_post_at: s.lastPostAt,
      status: s.status,
    })
    if (acc.xUserId !== s.xUserId || acc.handle !== s.username) {
      if (acc.handle.toLowerCase() !== s.username.toLowerCase()) renamed.push(`${acc.handle} → ${s.username}`)
      accountUpdates.push({ id: acc.id, platform: 'twitter', handle: s.username, x_user_id: s.xUserId })
    }
  }

  const { error: dErr } = await db.from('mkt_social_daily').upsert(daily, { onConflict: 'account_id,date' })
  if (dErr) throw new Error(`mkt_social_daily : ${dErr.message}`)
  if (accountUpdates.length) {
    // Un pseudo repris par un autre compte déclaré ferait échouer l'unicité (platform, handle) :
    // on le signale plutôt que de perdre le relevé du jour, déjà écrit.
    const { error: uErr } = await db.from('mkt_social_accounts').upsert(accountUpdates, { onConflict: 'id' })
    if (uErr) warnings.push(`mise à jour des comptes (identifiant X / pseudo) : ${uErr.message}`)
  }
  if (missing.length) warnings.push(`sans relevé : ${missing.join(', ')}`)
  if (renamed.length) warnings.push(`renommés : ${renamed.join(', ')}`)

  return {
    status: warnings.length ? 'degraded' : 'ok',
    accounts: accounts.length,
    read: users.length,
    missing,
    renamed,
    updatedDaily: daily.length,
    warnings,
  }
}
