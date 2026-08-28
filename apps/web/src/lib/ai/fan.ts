import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { FaultCode } from '@/lib/types/training'
import { anthropic, FAN_MODEL } from './client'
import { stripElim, toFanMessages, type HistoryMessage } from './prompts'

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number }
export type FanReply = { text: string; faultCode: FaultCode | null; ok: boolean; usage: AiUsage; latencyMs: number; model: string }

const usageOf = (m: Anthropic.Message): AiUsage => ({
  // Les tokens ÉCRITS en cache sont comptés dans l'entrée : `input_tokens` les EXCLUT, et sans ça
  // ils disparaîtraient du suivi de coût (`training_ai_calls` n'a pas de colonne pour eux). Ils
  // sont facturés 1,25× l'entrée, donc l'estimation les sous-évalue de 20 % — très loin devant le
  // 100 % qu'on perdait en les ignorant, et sans migration. Nul tant qu'on reste sous le seuil.
  inputTokens: m.usage.input_tokens + (m.usage.cache_creation_input_tokens ?? 0),
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
    // `cache_control` de tête = le marqueur se pose tout seul sur le DERNIER bloc cachable, donc en
    // fin d'historique : le tour suivant relit tout le préfixe (système + conversation) à 10 % du
    // prix d'entrée au lieu de le repayer plein tarif. Le tout est SANS EFFET aujourd'hui — Haiku
    // 4.5 exige un préfixe d'au moins 4096 tokens pour cacher quoi que ce soit, et un appel fan en
    // fait ~1 780 en moyenne (relevé sur `training_ai_calls` : 10 appels sur 3 269 au-dessus du
    // seuil). Rien n'est écrit, rien n'est facturé en plus, et le jour où un thread s'allonge assez
    // (boss) le cache s'allume seul. À revoir si le fan change de modèle : le minimum n'est pas
    // le même d'une génération à l'autre (512 sur Opus 5, 1024 sur Sonnet 5, 4096 sur Haiku 4.5).
    cache_control: { type: 'ephemeral' },
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
