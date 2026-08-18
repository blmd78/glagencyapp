import { z } from 'zod'
import type { ScoreAxis } from './prompts'

/**
 * Schéma de NOTATION structurée (output_config.format = json_schema) — généré depuis les axes du
 * module (un schéma par module, compilé/caché 24 h côté API). Les bornes numériques ne sont pas
 * exprimables en JSON schema structuré → revalidées par le Zod jumeau côté serveur.
 */
export function buildScoreJsonSchema(axes: ScoreAxis[]) {
  const properties: Record<string, unknown> = {}
  for (const a of axes) properties[a.key] = { type: 'integer', description: `${a.name} — ${a.description} (0 à 25)` }
  properties.total = { type: 'integer', description: 'Somme des axes, sur 100, plafond appliqué' }
  properties.objectif_atteint = { type: 'boolean' }
  properties.plafond = { type: 'integer', description: '65 si l’objectif n’est pas atteint' }
  properties.moments = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        cite: { type: 'string' }, type: { type: 'string', enum: ['good', 'bad'] }, probleme: { type: 'string' }, indice: { type: 'string' },
      },
      required: ['cite', 'type', 'probleme', 'indice'],
      additionalProperties: false,
    },
  }
  properties.commentaire = { type: 'string' }
  return {
    type: 'object' as const,
    properties,
    required: [...axes.map((a) => a.key), 'total', 'objectif_atteint', 'moments', 'commentaire'],
    additionalProperties: false as const,
  }
}

export const momentZod = z.object({
  cite: z.string().max(500),
  type: z.enum(['good', 'bad']),
  probleme: z.string().max(500),
  indice: z.string().max(500),
})
export type ScoreMoment = z.infer<typeof momentZod>

export function buildScoreZod(axes: ScoreAxis[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const a of axes) shape[a.key] = z.number().int().min(0).max(25)
  return z.object({
    ...shape,
    total: z.number().int().min(0).max(100),
    objectif_atteint: z.boolean(),
    plafond: z.number().int().min(0).max(100).optional(),
    moments: z.array(momentZod).max(3),
    commentaire: z.string().max(1500),
  })
}

export const BOSS_STEPS = [
  { key: 'setting', name: 'Setting' }, { key: 'transition', name: 'Transition' }, { key: 'sexting', name: 'Sexting' },
  { key: 'rencontre', name: 'Rencontre' }, { key: 'nego', name: 'Négociation' }, { key: 'relationnel', name: 'Relationnel' },
] as const
export const bossScoreJsonSchema = {
  type: 'object' as const,
  properties: {
    ...Object.fromEntries(BOSS_STEPS.map((s) => [s.key, { anyOf: [{ type: 'integer' }, { type: 'null' }], description: `${s.name} — 0 à 100, null si l’étape n’a pas eu lieu` }])),
    note: { type: 'integer', description: 'Moyenne des étapes non nulles, sur 100' },
    commentaire: { type: 'string' },
  },
  required: [...BOSS_STEPS.map((s) => s.key), 'note', 'commentaire'],
  additionalProperties: false as const,
}
// Clés écrites à la main (pas de Object.fromEntries) : TS ne propage pas les littéraux de BOSS_STEPS
// à travers un spread généré dynamiquement, et scoreBossThread indexe parsed[s.key] statiquement.
export const bossScoreZod = z.object({
  setting: z.number().int().min(0).max(100).nullable(),
  transition: z.number().int().min(0).max(100).nullable(),
  sexting: z.number().int().min(0).max(100).nullable(),
  rencontre: z.number().int().min(0).max(100).nullable(),
  nego: z.number().int().min(0).max(100).nullable(),
  relationnel: z.number().int().min(0).max(100).nullable(),
  note: z.number().int().min(0).max(100),
  commentaire: z.string().max(2000),
})
