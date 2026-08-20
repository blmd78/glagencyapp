import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { anthropic, FAN_MODEL, SCORE_MODEL } from './client'
import { RECRUIT_SCORE_SYSTEM, recruitBotSystem, recruitToMessages, recruitTranscript, type RecruitHistoryMessage, type RecruitPersonaName } from './recruit-prompts'
import { recruitScoreJsonSchema, recruitScoreZod } from './recruit-schema'

export type RecruitUsage = { inputTokens: number; outputTokens: number }
export type RecruitBotReply = { text: string; usage: RecruitUsage; ok: boolean }

/**
 * Le client (bot) répond — GLA call_bot/`/api/bot` : Haiku, non streamé, 150 tokens max, sans
 * thinking/temperature. Refus du modèle (`stop_reason: 'refusal'`, possible sur du sexting) →
 * réponse de repli GLA `"..."` et ok=false : jamais de crash, le test continue. Une sortie vide
 * (hors refus) retombe aussi sur `"..."` (GLA : `reply or "..."`). Les erreurs réseau/API remontent
 * (l'action publique les traduit en BusinessError).
 */
export async function replyAsRecruitBot(opts: { persona: RecruitPersonaName; history: RecruitHistoryMessage[] }): Promise<RecruitBotReply> {
  const res = await anthropic().messages.create({
    model: FAN_MODEL,
    max_tokens: 150,
    system: recruitBotSystem(opts.persona),
    messages: recruitToMessages(opts.history),
  })
  const usage: RecruitUsage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
  if (res.stop_reason === 'refusal') return { text: '...', usage, ok: false }
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim()
  return { text: text || '...', usage, ok: true }
}

export type RecruitScoreResult = {
  orthographe: number
  coherence: number
  relance: number
  vente: number
  total: number
  usage: RecruitUsage
}

/**
 * Notation Sonnet structurée — GLA score_json(MODEL_SCORE, SCORE_SYSTEM, …, CAND_SCORE_SCHEMA) /
 * `/api/score` : sortie contrainte par recruitScoreJsonSchema, thinking adaptatif, timeout dédié
 * (une notation ne doit jamais pendre indéfiniment). `total` est RECALCULÉ ici (somme des 4 axes
 * déjà clampés par le Zod), jamais celui du modèle — comme GLA le refait lui-même côté serveur
 * après score_json (`data["total"] = data["orthographe"] + …`).
 */
export async function scoreRecruitTranscript(history: RecruitHistoryMessage[]): Promise<RecruitScoreResult> {
  const res = await anthropic().messages.create(
    {
      model: SCORE_MODEL,
      // 2500 : les tokens de réflexion adaptative comptent DANS max_tokens (plafond, pas dépense) —
      // cf. lib/ai/score.ts (1500 coupait parfois la sortie structurée avant le JSON final).
      max_tokens: 2500,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: recruitScoreJsonSchema } },
      system: RECRUIT_SCORE_SYSTEM,
      messages: [{ role: 'user', content: `Transcription :\n\n${recruitTranscript(history)}` }],
    },
    { timeout: 60_000 },
  )
  if (res.stop_reason === 'refusal') throw new Error('Notation refusée par le modèle')
  if (res.stop_reason === 'max_tokens') throw new Error('Notation tronquée (max_tokens)')
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const usage: RecruitUsage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
  const parsed = recruitScoreZod.parse(JSON.parse(text) as unknown)
  const total = parsed.orthographe + parsed.coherence + parsed.relance + parsed.vente
  return { orthographe: parsed.orthographe, coherence: parsed.coherence, relance: parsed.relance, vente: parsed.vente, total, usage }
}
