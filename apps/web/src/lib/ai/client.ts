import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Client Anthropic — SERVEUR uniquement (`server-only` : un import côté client casse au build).
 * `ANTHROPIC_API_KEY` lue par le SDK depuis l'env. Modèles figés ici : fan = Haiku 4.5 (réponses
 * courtes, ~0,03 $ la session solo), notation = Sonnet 5 (jugement, un appel structuré).
 * Coût/latence tracés par appel dans training_ai_calls (lib/ai/log.ts).
 */
export const FAN_MODEL = 'claude-haiku-4-5'
export const SCORE_MODEL = 'claude-sonnet-5'

let client: Anthropic | null = null
export function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 2, timeout: 20_000 })
  return client
}
