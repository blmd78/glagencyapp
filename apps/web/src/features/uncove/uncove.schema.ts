import { z } from 'zod'

// Réutilisé par le form client (RHF) ET la Server Action → fichier séparé (règle archi-web).
export const addUncoveAccountSchema = z.object({
  label: z.string().trim().min(1, 'Nom requis').max(80),
  token: z.string().trim().min(20, 'Jeton trop court (colle le user_token complet)'),
})
export type AddUncoveAccountInput = z.infer<typeof addUncoveAccountSchema>

// Rattachement d'un compte à une modèle CRM + « CA hors MyPuls » (0164). `creatorId` nullable :
// un compte non rattaché compte quand même dans le CA global (décision Benoit 2026-09-22).
export const setUncoveLinkSchema = z.object({
  id: z.uuid(),
  creatorId: z.uuid().nullable(),
  countsInCa: z.boolean(),
})
export type SetUncoveLinkInput = z.infer<typeof setUncoveLinkSchema>
