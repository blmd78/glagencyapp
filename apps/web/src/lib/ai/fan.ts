import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { FaultCode } from '@/lib/types/training'
import { anthropic, FAN_MODEL } from './client'
import { stripElim, toFanMessages, type HistoryMessage } from './prompts'

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number }
export type FanReply = { text: string; faultCode: FaultCode | null; ok: boolean; usage: AiUsage; latencyMs: number; model: string }

const usageOf = (m: Anthropic.Message): AiUsage => ({
  inputTokens: m.usage.input_tokens,
  outputTokens: m.usage.output_tokens,
  cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
})

/**
 * Le fan répond (Haiku 4.5, non streamé, ~1-2 s). Refus du modèle (`stop_reason: 'refusal'`,
 * possible sur du sexting) → réponse de repli « … » et ok=false : jamais de crash, l'entraînement
 * continue. Les erreurs réseau/API remontent (l'action les transforme en BusinessError).
 */
export async function replyAsFan(opts: { system: string; history: HistoryMessage[]; maxTokens: number }): Promise<FanReply> {
  const t0 = Date.now()
  const res = await anthropic().messages.create({
    model: FAN_MODEL,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: toFanMessages(opts.history),
  })
  const latencyMs = Date.now() - t0
  const usage = usageOf(res)
  if (res.stop_reason === 'refusal') return { text: '…', faultCode: null, ok: false, usage, latencyMs, model: res.model }
  const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
  const { text, faultCode } = stripElim(raw)
  return { text: text.slice(0, 1000), faultCode, ok: true, usage, latencyMs, model: res.model }
}
