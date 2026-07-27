import { z } from 'zod'

/**
 * Compta — schémas PARTAGÉS entre les formulaires (RHF + zodResolver) et les Server Actions,
 * même patron que `features/planning/schema.ts`.
 */

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ')
const money = z.coerce.number().min(0, 'Montant positif attendu').max(99999, 'Montant trop élevé')

/** Saisie d'un JOUR (bonus/malus/handoffs). */
export const dayEntryInput = z.object({
  chatterId: z.uuid(),
  date: iso,
  bonus: money,
  malus: money,
  handoffs: z.coerce.number().int().min(0).max(999),
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type DayEntryInput = z.infer<typeof dayEntryInput>

/** Saisie d'une SEMAINE (idem + fixe setter). */
export const weekEntryInput = z.object({
  chatterId: z.uuid(),
  weekStart: iso,
  bonus: money,
  malus: money,
  handoffs: z.coerce.number().int().min(0).max(999),
  fixeSetter: money,
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type WeekEntryInput = z.infer<typeof weekEntryInput>

/** Paiement d'une quinzaine — porte l'INSTANTANÉ figé (spec §5.3). */
export const payInput = z.object({
  chatterId: z.uuid(),
  month: iso,
  period: z.union([z.literal(1), z.literal(2)]),
  coveredDays: z.array(iso).min(1, 'Au moins un jour couvert'),
  amount: money,
  caReference: money,
  modeApplied: z.enum(['percent', 'fixed']),
  // PAS `money` : c'est un TAUX en %, pas un montant, et la colonne est `numeric(5,2)` —
  // plafonnée à 999,99. Avec la borne des montants (99 999), un taux aberrant passait Zod
  // puis explosait en `numeric field overflow` Postgres brut, au lieu d'une erreur de
  // validation lisible.
  rateApplied: z.coerce.number().min(0, 'Taux positif attendu').max(999.99, 'Taux hors bornes'),
  baseAmount: money,
  setterAmount: money,
  bonusAmount: money,
  malusAmount: money,
  handoffsAmount: money,
  primeAmount: money,
  sanctionsAmount: money,
  note: z.string().trim().max(500, '500 caractères max').nullable(),
})
export type PayInput = z.infer<typeof payInput>
