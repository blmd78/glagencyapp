import type { createAdminClient } from '@glagency/db'
import { decryptToken } from '@glagency/db'
import { fetchSubsVolumes, fetchTxVolumes, mergeDaily } from '@glagency/uncove'

type Db = ReturnType<typeof createAdminClient>

// Les tables uncove_* (migration 0163) ne sont pas encore dans les types générés (0163 non
// appliquée) : accès via cast `as never`, comme ingest_session (cf. session.ts). À retirer
// après application + régénération de packages/db/src/types.ts.

export interface UncoveAccount {
  id: string
  label: string
  uncoveUserId: string
  currency: string
  token: string
}

export interface AccountRunResult {
  label: string
  days: number
  reconnect: boolean
}

/** Comptes actifs (status='ok') + token déchiffré. Ignore ceux dont le token est illisible. */
export async function loadActiveAccounts(db: Db): Promise<UncoveAccount[]> {
  const { data: accs, error } = await db
    .from('uncove_accounts' as never)
    .select('id, label, uncove_user_id, currency')
    .eq('status', 'ok')
  if (error) throw new Error(`uncove_accounts lecture : ${error.message}`)
  const rows = (accs ?? []) as unknown as Array<{ id: string; label: string; uncove_user_id: string; currency: string }>
  if (rows.length === 0) return []

  const { data: toks, error: e2 } = await db
    .from('uncove_account_tokens' as never)
    .select('account_id, token_encrypted')
    .in('account_id', rows.map((a) => a.id))
  if (e2) throw new Error(`uncove_account_tokens lecture : ${e2.message}`)
  const encByAccount = new Map(
    ((toks ?? []) as unknown as Array<{ account_id: string; token_encrypted: string }>).map((t) => [
      t.account_id,
      t.token_encrypted,
    ]),
  )

  const out: UncoveAccount[] = []
  for (const a of rows) {
    const enc = encByAccount.get(a.id)
    const token = enc ? decryptToken(enc) : null
    if (!token) {
      console.warn(`[uncove] token illisible/absent pour « ${a.label} » — compte ignoré`)
      continue
    }
    out.push({ id: a.id, label: a.label, uncoveUserId: a.uncove_user_id, currency: a.currency, token })
  }
  return out
}

/** Scrape un compte sur [startIso, endIso] et upsert uncove_daily. Un 401/403 → statut « reconnect ». */
export async function ingestAccount(
  db: Db,
  acc: UncoveAccount,
  startIso: string,
  endIso: string,
): Promise<AccountRunResult> {
  try {
    const [subs, revenue] = await Promise.all([
      fetchSubsVolumes(acc.token, startIso, endIso),
      fetchTxVolumes(acc.token, startIso, endIso, acc.currency),
    ])
    const now = new Date().toISOString()
    const rows = mergeDaily(subs, revenue).map((r) => ({
      account_id: acc.id,
      day: r.day,
      subs_new: r.new,
      subs_canceled: r.canceled,
      subs_current: r.current,
      revenue: r.revenue,
      updated_at: now,
    }))
    if (rows.length) {
      const { error } = await db
        .from('uncove_daily' as never)
        .upsert(rows as never, { onConflict: 'account_id,day' })
      if (error) throw new Error(`uncove_daily upsert : ${error.message}`)
    }
    await db.from('uncove_accounts' as never).update({ last_synced_at: now } as never).eq('id', acc.id)
    return { label: acc.label, days: rows.length, reconnect: false }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('401') || msg.includes('403')) {
      await db.from('uncove_accounts' as never).update({ status: 'reconnect' } as never).eq('id', acc.id)
      console.error(`[uncove] « ${acc.label} » : jeton rejeté (${msg}) → statut « reconnect »`)
      return { label: acc.label, days: 0, reconnect: true }
    }
    throw err
  }
}
