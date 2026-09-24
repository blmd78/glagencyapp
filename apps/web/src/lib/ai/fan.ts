import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type { FaultCode } from '@/lib/types/training'
import { anthropic, FAN_MODEL, trainingFanModels, withOverloadFallback } from './client'
import { stripElim, toFanMessages, type FanPrompts, type HistoryMessage } from './prompts'

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
export type FanReply = { text: string; faultCode: FaultCode | null; ok: boolean; usage: AiUsage; latencyMs: number; model: string }

const usageOf = (m: Anthropic.Message): AiUsage => ({
  // Les tokens ÉCRITS en cache ont leur propre colonne depuis la migration 0141 : ils étaient
  // jusqu'ici fondus dans l'entrée, faute de place, ce qui les sous-évaluait de 20 % (ils se
  // facturent 1,25× l'entrée en TTL 5 min, 2× en TTL 1 h). Nuls sur Haiku 4.5, dont le préfixe
  // (~2 400 tokens) est sous le minimum de 4 096 du modèle ; c'est Sonnet qui les remplit.
  inputTokens: m.usage.input_tokens,
  outputTokens: m.usage.output_tokens,
  cacheReadTokens: m.usage.cache_read_input_tokens ?? 0,
  cacheWriteTokens: m.usage.cache_creation_input_tokens ?? 0,
})

/**
 * Le fan répond (Haiku 4.5 puis Sonnet 5 à partir du 28/09 — cf. `trainingFanModels` —, non
 * streamé, ~1-3 s). Refus du modèle (`stop_reason: 'refusal'`, possible sur du sexting) → réponse
 * de repli « … » et ok=false : jamais de crash, l'entraînement continue. Les erreurs réseau/API
 * remontent (l'action les transforme en BusinessError).
 *
 * Chaque modèle reçoit SON prompt (`prompts.haiku` pour Haiku, `prompts.sonnet` pour tout autre) :
 * celui de Sonnet porte des garde-fous et un ordre différent, validés pour lui seul.
 *
 * Modèle SATURÉ (529) → la même requête repart sur le modèle de repli (cf. `withOverloadFallback`) :
 * le 2026-09-02, une vague de 17 minutes sur Haiku a bloqué les envois de toute la formation, alors
 * que le reste de l'API répondait. Le `model` rendu est celui qui a effectivement répondu — c'est lui
 * qui part dans `training_ai_calls`, donc la bascule se lit dans les coûts.
 */
export async function replyAsFan(opts: { prompts: FanPrompts; history: HistoryMessage[]; maxTokens: number }): Promise<FanReply> {
  const t0 = Date.now()
  const res = await withOverloadFallback((model, request) => anthropic().messages.create({
    // `cache_control` de tête = le marqueur se pose tout seul sur le DERNIER bloc cachable, donc en
    // fin d'historique : le tour suivant relit tout le préfixe (système + conversation) à 10 % du
    // prix d'entrée au lieu de le repayer plein tarif. SANS EFFET sur Haiku 4.5 — il exige un
    // préfixe d'au moins 4 096 tokens, un appel fan en fait ~1 780 : rien n'est écrit, rien n'est
    // facturé en plus. Actif sur Sonnet 5 (minimum 1 024) : 90 % des appels relisent le cache au
    // banc du 2026-09-24. Le prompt Sonnet pose en plus son propre marqueur (1 h) sur sa partie
    // fixe, partagée par toutes les conversations — cf. `sonnetBlocks` dans `prompts.ts`.
    cache_control: { type: 'ephemeral' },
    model,
    // Réflexion COUPÉE explicitement — sans effet sur Haiku 4.5 (qui n'en fait pas par défaut),
    // décisif sur Sonnet 5 : il réfléchit quand on ne dit rien, et ses tokens de réflexion comptent
    // dans `max_tokens` (200 ici) — une réplique pouvait revenir vide, facturée en sortie à 10 $/M.
    // Accepté par les deux modèles (vérifié à l'appel, 2026-09-02).
    thinking: { type: 'disabled' },
    max_tokens: opts.maxTokens,
    system: model === FAN_MODEL ? opts.prompts.haiku : opts.prompts.sonnet,
    messages: toFanMessages(opts.history),
  }, request), trainingFanModels())
  const latencyMs = Date.now() - t0
  const usage = usageOf(res)
  if (res.stop_reason === 'refusal') return { text: '…', faultCode: null, ok: false, usage, latencyMs, model: res.model }
  const raw = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
  const { text, faultCode } = stripElim(raw)
  return { text: text.slice(0, 1000), faultCode, ok: true, usage, latencyMs, model: res.model }
}
