import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { FaultCode } from '@/lib/types/training'
import { anthropic, FAN_FALLBACK_MODEL, FAN_MODEL, withOverloadFallback } from './client'
import { stripElim, toFanMessages, type HistoryMessage } from './prompts'

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
export type FanReply = { text: string; faultCode: FaultCode | null; ok: boolean; usage: AiUsage; latencyMs: number; model: string }

const usageOf = (m: Anthropic.Message): AiUsage => ({
  // Les tokens ÉCRITS en cache ont leur propre colonne depuis la migration 0141 : ils étaient
  // jusqu'ici fondus dans l'entrée, faute de place, ce qui les sous-évaluait de 20 % (ils se
  // facturent 1,25× l'entrée en TTL 5 min, 2× en TTL 1 h). Ils restent nuls ici tant que le fan
  // tourne sur Haiku 4.5 : son préfixe (~2 400 tokens) est sous le minimum de 4 096 du modèle.
  inputTokens: m.usage.input_tokens,
  outputTokens: m.usage.output_tokens,
  cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: m.usage.cache_creation_input_tokens ?? 0,
})

/**
 * Le fan répond (Haiku 4.5, non streamé, ~1-2 s). Refus du modèle (`stop_reason: 'refusal'`,
 * possible sur du sexting) → réponse de repli « … » et ok=false : jamais de crash, l'entraînement
 * continue. Les erreurs réseau/API remontent (l'action les transforme en BusinessError).
 *
 * Modèle SATURÉ (529) → la même requête repart sur `FAN_FALLBACK_MODEL` (cf. `withOverloadFallback`) :
 * le 2026-09-02, une vague de 17 minutes sur Haiku a bloqué les envois de toute la formation, alors
 * que le reste de l'API répondait. Le `model` rendu est celui qui a effectivement répondu — c'est lui
 * qui part dans `training_ai_calls`, donc la bascule se lit dans les coûts.
 */
export async function replyAsFan(opts: { system: string; history: HistoryMessage[]; maxTokens: number }): Promise<FanReply> {
  const t0 = Date.now()
  const res = await withOverloadFallback((model, request) => anthropic().messages.create({
    // `cache_control` de tête = le marqueur se pose tout seul sur le DERNIER bloc cachable, donc en
    // fin d'historique : le tour suivant relit tout le préfixe (système + conversation) à 10 % du
    // prix d'entrée au lieu de le repayer plein tarif. Le tout est SANS EFFET aujourd'hui — Haiku
    // 4.5 exige un préfixe d'au moins 4096 tokens pour cacher quoi que ce soit, et un appel fan en
    // fait ~1 780 en moyenne (relevé sur `training_ai_calls` : 10 appels sur 3 269 au-dessus du
    // seuil). Rien n'est écrit, rien n'est facturé en plus, et le jour où un thread s'allonge assez
    // (boss) le cache s'allume seul. À revoir si le fan change de modèle : le minimum n'est pas
    // le même d'une génération à l'autre (512 sur Opus 5, 1024 sur Sonnet 5, 4096 sur Haiku 4.5) —
    // c'est justement le cas des appels de REPLI, qui partent sur Sonnet 5 : eux dépassent le seuil
    // et écrivent le cache (1,25× l'entrée). Relu au tour suivant seulement si le modèle principal
    // est toujours saturé ; sinon c'est ~0,001 $ perdu par appel de repli, pendant une vague. Assumé :
    // une exception au marqueur coûterait plus cher à comprendre qu'à payer.
    cache_control: { type: 'ephemeral' },
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: toFanMessages(opts.history),
  }, request), { model: FAN_MODEL, fallbackModel: FAN_FALLBACK_MODEL })
  const latencyMs = Date.now() - t0
  const usage = usageOf(res)
  if (res.stop_reason === 'refusal') return { text: '…', faultCode: null, ok: false, usage, latencyMs, model: res.model }
  const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
  const { text, faultCode } = stripElim(raw)
  return { text: text.slice(0, 1000), faultCode, ok: true, usage, latencyMs, model: res.model }
}
