import { z } from 'zod'

/** Moyens de paiement proposés (partagé VA / Compta — source unique). */
export const PAYMENT_OPTIONS = ['virement', 'paypal', 'crypto', 'autre'] as const

/**
 * Fiche VA — schéma PARTAGÉ entre le dialog (RHF + zodResolver, erreurs par champ)
 * et les server actions (safeParse), même patron que features/members/schema.ts.
 */
export const staffFields = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(80, '80 caractères max'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide'),
  fixedEur: z.number({ message: 'Nombre requis' }).min(0, 'Doit être ≥ 0').max(100000, 'Trop élevé'),
  rateTw: z.number({ message: 'Nombre requis' }).min(0, 'Doit être ≥ 0').max(1000, 'Trop élevé'),
  rateIg: z.number({ message: 'Nombre requis' }).min(0, 'Doit être ≥ 0').max(1000, 'Trop élevé'),
  bonusEur: z.number({ message: 'Nombre requis' }).min(0, 'Doit être ≥ 0').max(100000, 'Trop élevé'),
  paymentMethod: z.string().min(1).max(40),
})

/** Formulaire du dialog : fiche + assignations. */
export const staffForm = staffFields.extend({
  linkIds: z.array(z.uuid()),
  igAccountIds: z.array(z.uuid()),
  twAccountIds: z.array(z.uuid()),
})
export type StaffForm = z.infer<typeof staffForm>
