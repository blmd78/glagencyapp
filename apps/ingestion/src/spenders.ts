import {
  fetchChatInit,
  fetchTeamMoney,
  login,
  switchCreator,
  type ChatConversation,
  type MoneyTx,
} from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'
import { loadEnv } from './env'

type Db = ReturnType<typeof createAdminClient>

/**
 * Ingestion CRM spenders — deux faits :
 * 1. fan_transactions : API /team/money par jour (payment_id = idempotence) → backfill
 *    historique possible (`pnpm spenders 2026-07-01 2026-07-08`) et passage quotidien.
 * 2. spender_conversations : /chat/init par modèle (boucle switch-creator, session web)
 *    → état courant upserté (dernier message, CA, assignation MyPuls).
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
function* eachDay(from: string, to: string) {
  const d = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (d <= end) {
    yield iso(d)
    d.setUTCDate(d.getUTCDate() + 1)
  }
}

/** Map mypuls_creator_id → creators.id (uuid), pour rattacher les faits. */
async function creatorMap(db: Db): Promise<Map<string, string>> {
  const { data, error } = await db.from('creators').select('id, mypuls_creator_id')
  if (error) throw new Error(`creators: ${error.message}`)
  const map = new Map<string, string>()
  for (const c of data ?? []) if (c.mypuls_creator_id) map.set(String(c.mypuls_creator_id), c.id)
  return map
}

/** Transactions d'un jour → upsert fan_transactions (les lignes sans fan sont ignorées). */
export async function ingestFanTransactions(db: Db, byMypulsId: Map<string, string>, day: string) {
  const txs: MoneyTx[] = await fetchTeamMoney(day)
  const rows = txs
    .filter((t) => t.fan_id && t.fan)
    .map((t) => ({
      payment_id: t.payment_id,
      occurred_at: t.date,
      // L'API renvoie l'ISO en heure locale Paris (+02:00) : les 10 premiers chars = jour Paris.
      date: t.date.slice(0, 10),
      mypuls_creator_id: String(t.creator_id),
      creator_id: byMypulsId.get(String(t.creator_id)) ?? null,
      fan_id: t.fan_id!,
      fan_username: t.fan!,
      amount: t.amount,
      net: t.net ?? t.amount,
      kind: t.kind ?? null,
      type: t.type ?? null,
      attributed_mypuls_user_id: t.attributed_user_id != null ? String(t.attributed_user_id) : null,
    }))
  if (rows.length) {
    const { error } = await db.from('fan_transactions').upsert(rows, { onConflict: 'payment_id' })
    if (error) throw new Error(`fan_transactions ${day}: ${error.message}`)
  }
  return { day, fetched: txs.length, upserted: rows.length }
}

/** Conversations d'un modèle → upsert spender_conversations (état courant). */
async function ingestConversations(db: Db, creatorId: string, convs: ChatConversation[]) {
  const capturedAt = new Date().toISOString()
  const rows = convs.map((c) => ({
    creator_id: creatorId,
    fan_id: c.id,
    username: c.username,
    ca_total: c.ca ?? 0,
    status: c.statusLabel ?? c.status ?? null,
    last_message_at: c.lastMessage?.date ? new Date(c.lastMessage.date * 1000).toISOString() : null,
    last_message_is_mine: c.lastMessage?.isMine ?? null,
    has_unread: c.hasUnread ?? false,
    assigned_mypuls_user_id: c.assignUser ? String(c.assignUser.id) : null,
    assigned_label: c.assignUser?.label ?? null,
    captured_at: capturedAt,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from('spender_conversations')
      .upsert(rows.slice(i, i + 500), { onConflict: 'creator_id,fan_id' })
    if (error) throw new Error(`spender_conversations: ${error.message}`)
  }
  return rows.length
}

/** Boucle tous modèles : switch-creator → chat/init → upsert. */
export async function ingestAllConversations(db: Db, byMypulsId: Map<string, string>) {
  const { cookie } = await login()
  const out: Array<{ mypulsId: string; conversations: number }> = []
  for (const [mypulsId, creatorId] of byMypulsId) {
    try {
      await switchCreator(mypulsId, cookie)
      const convs = await fetchChatInit(cookie)
      const n = await ingestConversations(db, creatorId, convs)
      out.push({ mypulsId, conversations: n })
      console.log(`[spenders] creator ${mypulsId}: ${n} conversations`)
    } catch (e) {
      console.error(`[spenders] creator ${mypulsId}: ÉCHEC —`, (e as Error).message)
    }
  }
  return out
}

/** CLI : `tsx src/spenders.ts [from] [to]` — sans argument : hier seul + conversations. */
async function main() {
  loadEnv()
  const db = createAdminClient()
  const byMypulsId = await creatorMap(db)

  const yesterday = iso(new Date(Date.now() - 24 * 3600 * 1000))
  const from = process.argv[2] ?? yesterday
  const to = process.argv[3] ?? process.argv[2] ?? yesterday

  for (const day of eachDay(from, to)) {
    const r = await ingestFanTransactions(db, byMypulsId, day)
    console.log(`[spenders] transactions ${r.day}: ${r.upserted}/${r.fetched}`)
  }
  await ingestAllConversations(db, byMypulsId)
  console.log('[spenders] terminé')
}

const isCli = process.argv[1]?.endsWith('spenders.ts')
if (isCli) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
