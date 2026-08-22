import { z } from 'zod'
import { OBJECTIVE_CAP } from '@glagency/core'
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
  properties.plafond = { type: 'integer', description: `${OBJECTIVE_CAP} si l’objectif n’est pas atteint` }
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

// Les chaînes sont TRONQUÉES (pas rejetées) au-delà de leur longueur max : une notation payante
// ne doit pas échouer pour un débordement de texte du modèle, seul un type/une clé manquante doit.
const truncated = (max: number) => z.string().transform((s) => s.slice(0, max))
const momentZod = z.object({
  cite: truncated(500),
  type: z.enum(['good', 'bad']),
  probleme: truncated(500),
  indice: truncated(500),
})
export type ScoreMoment = z.infer<typeof momentZod>

/**
 * Une note d'axe hors [0, 25] est CLAMPÉE (pas rejetée) : seul un type non-numérique fait échouer —
 * une notation PAYANTE ne doit pas rater sur un débordement ou un arrondi du modèle.
 * Exportée : le test de recrutement note lui aussi 4 axes sur 25 (`lib/ai/recruit-schema.ts`).
 */
export const clampedAxisScore = z.number().transform((n) => Math.max(0, Math.min(25, Math.round(n))))

export function buildScoreZod(axes: ScoreAxis[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const a of axes) shape[a.key] = clampedAxisScore
  return z.object({
    ...shape,
    // `total` et `plafond` sont RECALCULÉS côté serveur (scoreThread : somme des axes + plafond) :
    // la valeur du modèle n'est jamais utilisée telle quelle → aucune borne, une notation PAYANTE
    // ne doit pas échouer parce que le modèle a mal additionné.
    total: z.number(),
    objectif_atteint: z.boolean(),
    // CLAMPÉ (pas rejeté), comme les notes d'axes : une notation PAYANTE ne doit pas échouer parce
    // que le modèle a renvoyé un plafond hors bornes. Appliqué par `scoreThread`.
    plafond: z.number().int().transform((n) => Math.min(100, Math.max(0, n))).optional(),
    // Le modèle peut renvoyer plus de 3 moments malgré le schéma structuré : on tronque plutôt
    // que de rejeter toute la notation pour un débordement de tableau.
    moments: z.array(momentZod).transform((arr) => arr.slice(0, 3)),
    commentaire: truncated(1500),
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
// Une note d'étape hors [0, 100] est CLAMPÉE (pas rejetée), null (étape non jouée) traverse intact.
const clampedStepScore = z.number().nullable().transform((n) => (n === null ? null : Math.max(0, Math.min(100, Math.round(n)))))
export const bossScoreZod = z.object({
  setting: clampedStepScore,
  transition: clampedStepScore,
  sexting: clampedStepScore,
  rencontre: clampedStepScore,
  nego: clampedStepScore,
  relationnel: clampedStepScore,
  // `note` : recalculée par scoreBossThread (moyenne des étapes jouées) → non bornée ici, même
  // raison que `total` ci-dessus.
  note: z.number(),
  commentaire: truncated(2000),
})
