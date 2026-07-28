import { z } from 'zod'

// Schémas PARTAGÉS client (form) ↔ serveur (actions) — source unique.

/** Cible = une conversation spender (creator_id + fan_id). */
const target = {
  creatorId: z.uuid(),
  fanId: z.number().int().positive(),
}

export const relanceInput = z.object({
  ...target,
  /** Chatteur crédité de la relance (le closer assigné, résolu chez nous). Null = non assigné. */
  chatterId: z.uuid().nullable(),
})

export const targetInput = z.object(target)

/** Correction admin du compteur R (valeur forcée, 0–10). */
export const setCompteurInput = z.object({
  ...target,
  value: z.number().int().min(0).max(10),
})

/** Archive / désarchive (le flag voyage désormais DANS l'input — un seul arg pour runAction). */
export const archiveInput = z.object({
  ...target,
  archived: z.boolean(),
})
