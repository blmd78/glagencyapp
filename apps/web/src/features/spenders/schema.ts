import { z } from 'zod'

// Schémas PARTAGÉS client (form) ↔ serveur (actions) — source unique.

/** Cible = une conversation spender (creator_id + fan_id). */
const target = {
  creatorId: z.string().uuid(),
  fanId: z.number().int().positive(),
}

export const relanceInput = z.object({
  ...target,
  /** Chatteur crédité de la relance (le closer assigné, résolu chez nous). Null = non assigné. */
  chatterId: z.string().uuid().nullable(),
  note: z.string().max(500).optional(),
})
export type RelanceInput = z.infer<typeof relanceInput>

export const targetInput = z.object(target)
export type TargetInput = z.infer<typeof targetInput>
