import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { BOSS_PASS, OBJECTIVE_CAP } from '@glagency/core'
import { anthropic, SCORE_MODEL } from './client'
import type { AiUsage } from './fan'
import type { ScoreAxis } from './prompts'
import { BOSS_STEPS, bossScoreJsonSchema, bossScoreZod, buildScoreJsonSchema, buildScoreZod, type ScoreMoment } from './schema'

export type AxisScore = { key: string; name: string; score: number }
export type ScoreResult = {
  total: number; objectiveReached: boolean; capped: boolean; comment: string; moments: ScoreMoment[]
  axes: AxisScore[]; usage: AiUsage; latencyMs: number; model: string
}

// `OBJECTIVE_CAP` (plafond 65 quand l'objectif n'est pas atteint) et `BOSS_PASS` (boss réussi à 60)
// viennent de `@glagency/core` (training/rules) : ce sont des règles du domaine, énoncées AUSSI en
// prose aux modèles par `prompts.ts` / `schema.ts`.

/**
 * UN appel de notation structurée — la seule implémentation du projet : l'entraînement (ici) et le
 * test de recrutement (`recruit-score.ts`) partagent modèle, plafond de tokens, thinking adaptatif,
 * format contraint et timeout. Seuls le `system`, le schéma et le PRÉFIXE du message user changent
 * (les prompts sont des transpositions GLA fidèles, on ne les uniformise pas).
 *
 * Exportée pour `recruit-score.ts` : deux notations PAYANTES ne doivent pas dériver l'une de
 * l'autre (un `max_tokens` relevé d'un seul côté ne se verrait que sur la facture).
 */
export async function callStructured(
  system: string,
  transcript: string,
  schema: Record<string, unknown>,
  userPrefix = 'Transcription de la conversation :',
) {
  const t0 = Date.now()
  const res = await anthropic().messages.create(
    {
      model: SCORE_MODEL,
      // 2500 : les tokens de réflexion adaptative comptent DANS max_tokens (c'est un plafond, pas
      // une dépense) — 1500 coupait parfois la sortie structurée avant le JSON final.
      max_tokens: 2500,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: `${userPrefix}\n\n${transcript}` }],
    },
    { timeout: 60_000 },
  )
  const latencyMs = Date.now() - t0
  if (res.stop_reason === 'refusal') throw new Error('Notation refusée par le modèle')
  if (res.stop_reason === 'max_tokens') throw new Error('Notation tronquée (max_tokens)')
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const usage: AiUsage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: res.usage.cache_read_input_tokens ?? 0 }
  return { json: JSON.parse(text) as unknown, usage, latencyMs, model: res.model }
}

/**
 * Notation d'un thread SOLO/DÉFI (axes du module) — UN appel structuré. Le total est
 * DÉTERMINISTE côté serveur : somme des axes, plafonnée à 65 si l'objectif n'est pas atteint
 * (GLA « plafond ») — on ne fait pas confiance à l'arithmétique du modèle.
 */
export async function scoreThread(opts: { system: string; transcript: string; axes: ScoreAxis[] }): Promise<ScoreResult> {
  const { json, usage, latencyMs, model } = await callStructured(opts.system, opts.transcript, buildScoreJsonSchema(opts.axes))
  const parsed = buildScoreZod(opts.axes).parse(json)
  // Clés d'axes dynamiques (module DB) : non exprimables statiquement dans le shape Zod généré ;
  // les bornes 0-25 sont déjà revalidées à l'exécution par buildScoreZod ci-dessus.
  const parsedAxes = parsed as unknown as Record<string, number>
  const axes = opts.axes.map((a) => ({ key: a.key, name: a.name, score: parsedAxes[a.key] }))
  const sum = axes.reduce((n, a) => n + a.score, 0)
  const objectiveReached = parsed.objectif_atteint
  const cap = objectiveReached ? 100 : OBJECTIVE_CAP
  return {
    total: Math.min(sum, cap), objectiveReached, capped: !objectiveReached && sum > OBJECTIVE_CAP,
    comment: parsed.commentaire, moments: parsed.moments, axes, usage, latencyMs, model,
  }
}

/** Notation d'un fan du BOSS : 6 étapes /100 (null = non jouée), note = moyenne des étapes jouées ; réussi si ≥ 60. */
export async function scoreBossThread(opts: { system: string; transcript: string }): Promise<ScoreResult> {
  const { json, usage, latencyMs, model } = await callStructured(opts.system, opts.transcript, bossScoreJsonSchema)
  const parsed = bossScoreZod.parse(json)
  const axes = BOSS_STEPS.flatMap((s) => (parsed[s.key] == null ? [] : [{ key: s.key, name: s.name, score: parsed[s.key] as number }]))
  const total = axes.length ? Math.round(axes.reduce((n, a) => n + a.score, 0) / axes.length) : 0
  return { total, objectiveReached: total >= BOSS_PASS, capped: false, comment: parsed.commentaire, moments: [], axes, usage, latencyMs, model }
}
