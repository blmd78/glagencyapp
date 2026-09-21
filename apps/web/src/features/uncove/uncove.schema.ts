import { z } from 'zod'

// Réutilisé par le form client (RHF) ET la Server Action → fichier séparé (règle archi-web).
export const addUncoveAccountSchema = z.object({
  label: z.string().trim().min(1, 'Nom requis').max(80),
  token: z.string().trim().min(20, 'Jeton trop court (colle le user_token complet)'),
})
export type AddUncoveAccountInput = z.infer<typeof addUncoveAccountSchema>
