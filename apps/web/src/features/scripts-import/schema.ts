import { z } from 'zod'
import { notionPageId } from '@glagency/scripts/notion'

/**
 * Entrée de « Préparer » : l'id d'un script de la liste OU un lien Notion collé (script rangé hors
 * des deux niveaux listés). Toujours normalisé par `notionPageId` — jamais injecté tel quel dans
 * les chemins de l'API Notion. Le titre est relu chez Notion, pas fourni par le client.
 */
export const prepareImportSchema = z.object({
  notionPageId: z
    .string()
    .trim()
    .min(1)
    .transform((v, ctx) => {
      try {
        return notionPageId(v)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Lien Notion invalide : colle le lien de la page du script.' })
        return z.NEVER
      }
    }),
  creatorId: z.uuid(),
})
