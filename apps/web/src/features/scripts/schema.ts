import { z } from 'zod'

// Schéma Zod PARTAGÉ dialog (RHF + zodResolver) / server actions — même patron que
// features/planning/schema.ts.

/** Champs édités dans le dialog (création et édition d'un item du script). */
export const itemForm = z.object({
  kind: z.enum(['section', 'message', 'note', 'warn']),
  label: z.string().trim().max(80, '80 caractères max'),
  body: z.string().trim().max(2000, '2000 caractères max'),
})
export type ItemForm = z.infer<typeof itemForm>

/** Côté serveur : + identités (id null = création en fin de script). */
export const itemInput = itemForm.extend({
  id: z.uuid().nullable(),
  creatorId: z.uuid(),
})
