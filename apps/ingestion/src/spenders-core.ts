import {
  fetchChatInit,
  fetchTeamMoney,
  switchCreator,
  type ChatConversation,
  type MoneyTx,
} from '@glagency/mypuls'
import { createAdminClient } from '@glagency/db'
import { normLabel } from './norm'

// Briques PURES du scrape spenders (aucune dépendance Node/CLI : ni fs, ni @sentry/node) →
// importables par le CLI (spenders.ts) ET par le Worker Cloudflare (worker.ts).

type Db = ReturnType<typeof createAdminClient>

/** Résout un label MyPuls → chatter_id. Ne CRÉE PAS de chatteur (null si non rapproché). */
export type ChatterResolver = (label: string | null) => string | null

/**
 * Construit le résolveur label → NOTRE chatter_id (même clé que money-team : chatter_alias /
 * display_name / email normalisés). 2 lectures Supabase — à réutiliser sur tous les modèles.
 */
export async function chatterResolver(db: Db): Promise<ChatterResolver> {
  const [{ data: chatters }, { data: aliases }] = await Promise.all([
    db.from('chatters').select('id, display_name, email'),
    db.from('chatter_alias').select('chatter_id, raw_label_norm'),
  ])
  const byNorm = new Map<string, string>()
  for (const c of chatters ?? []) {
    if (c.display_name) byNorm.set(normLabel(c.display_name), c.id)
    if (c.email) byNorm.set(normLabel(c.email), c.id)
  }
  for (const a of aliases ?? []) byNorm.set(normLabel(a.raw_label_norm), a.chatter_id)
  return (label) => (label ? (byNorm.get(normLabel(label)) ?? null) : null)
}

/** Map mypuls_creator_id → creators.id (uuid). */
export async function creatorMap(db: Db): Promise<Map<string, string>> {
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

/** Conversations d'un modèle → upsert spender_conversations (état courant), par lots de 500. */
async function ingestConversations(
  db: Db,
  creatorId: string,
  convs: ChatConversation[],
  resolveChatter: ChatterResolver,
): Promise<number> {
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
    assigned_chatter_id: resolveChatter(c.assignUser?.label ?? null),
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

/**
 * Scrape UN modèle : bascule le contexte MyPuls, récupère ses conversations, upsert.
 * Le cookie de session est fourni par l'appelant (login partagé → pas de re-login par modèle).
 * C'est l'unité de travail d'une mini-invocation du Worker (fan-out).
 */
export async function ingestOneModel(
  db: Db,
  cookie: string,
  mypulsId: string,
  creatorId: string,
  resolveChatter: ChatterResolver,
): Promise<number> {
  await switchCreator(mypulsId, cookie)
  const convs = await fetchChatInit(cookie)
  return ingestConversations(db, creatorId, convs, resolveChatter)
}

/** Boucle SÉQUENTIELLE tous modèles (CLI Node — sans contrainte CPU). */
export async function ingestAllConversations(db: Db, cookie: string, byMypulsId: Map<string, string>) {
  const resolveChatter = await chatterResolver(db)
  const out: Array<{ mypulsId: string; conversations: number }> = []
  for (const [mypulsId, creatorId] of byMypulsId) {
    try {
      const n = await ingestOneModel(db, cookie, mypulsId, creatorId, resolveChatter)
      out.push({ mypulsId, conversations: n })
      console.log(`[spenders] creator ${mypulsId}: ${n} conversations`)
    } catch (e) {
      console.error(`[spenders] creator ${mypulsId}: ÉCHEC —`, (e as Error).message)
    }
  }
  return out
}
