import { z } from 'zod'

// Partagé par le formulaire (RHF) ET les Server Actions — règle archi-web.

/** Une clé est un identifiant technique : elle voyage dans `mkt_links.type` et dans l'URL. */
const key = z
  .string()
  .trim()
  .min(2, 'Clé trop courte')
  .max(40)
  .regex(/^[a-z0-9_]+$/, 'Minuscules, chiffres et « _ » uniquement')

/**
 * Le motif est lu par Postgres ET par JavaScript. On refuse ici ce que JS ne sait pas compiler :
 * une parenthèse oubliée passerait sinon en base, où elle ne casserait rien — la règle ignore
 * les motifs illisibles — mais ne rangerait jamais rien, sans que personne comprenne pourquoi.
 */
const pattern = z
  .string()
  .trim()
  .max(200, 'Motif trop long')
  .refine(
    (p) => {
      if (p === '') return true
      try {
        new RegExp(p, 'i')
        return true
      } catch {
        return false
      }
    },
    { message: 'Motif illisible (vérifie les parenthèses)' },
  )

export const createGroupSchema = z.object({
  key,
  label: z.string().trim().min(1, 'Nom requis').max(40),
  pattern,
  color: z.string().trim().max(40),
  priority: z.coerce.number().int().min(1).max(998),
})
export type CreateGroupInput = z.infer<typeof createGroupSchema>
/** Type d'ENTRÉE du formulaire : `priority` passe par `z.coerce`, son input est `unknown`. */
export type GroupFormValues = z.input<typeof createGroupSchema>

export const updateGroupSchema = createGroupSchema.omit({ key: true }).extend({ key })
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>

export const deleteGroupSchema = z.object({ key })
