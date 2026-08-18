import 'server-only'
import type { createAdminClient } from '@glagency/db'
import type { AiUsage } from './fan'

type Admin = ReturnType<typeof createAdminClient>
export type AiCallEntry = {
  sessionId: string; threadId: string | null; kind: 'fan' | 'score'; model: string
  usage: AiUsage; latencyMs: number; ok: boolean
}

/** Trace un appel IA (service-role — aucune policy d'écriture authenticated). Ne bloque jamais l'action : erreur avalée + console.error. */
export async function logAiCall(admin: Admin, e: AiCallEntry): Promise<void> {
  const { error } = await admin.from('training_ai_calls').insert({
    session_id: e.sessionId, thread_id: e.threadId, kind: e.kind, model: e.model,
    input_tokens: e.usage.inputTokens, output_tokens: e.usage.outputTokens, cache_read_tokens: e.usage.cacheReadTokens,
    latency_ms: e.latencyMs, ok: e.ok,
  })
  if (error) console.error('[training_ai_calls]', error.message)
}
