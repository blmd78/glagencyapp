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

/**
 * Paramètres d'une tranche (0104). `sort` est une ENUM fermée : la valeur descend jusqu'à un
 * `case` SQL, et une chaîne libre y serait au mieux ignorée, au pire une surface d'attaque si
 * le tri passait un jour en SQL dynamique.
 */
export const spendersPageInput = z.object({
  view: z.enum(['liste', 'tracker', 'alertes', 'archive']),
  models: z.array(z.uuid()).max(50).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['ca', 'compteurR', 'username', 'model', 'lastMessage']).optional(),
  desc: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
})
