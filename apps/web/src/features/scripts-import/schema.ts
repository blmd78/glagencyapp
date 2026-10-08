import { z } from 'zod'
import { notionPageId } from '@glagency/scripts/notion'

/**
 * Entrée de « Préparer » : l'id d'un script de la liste (avec son espace, `connectionId`) OU un lien
 * Notion collé (sans espace : cherché dans chaque espace connecté). Toujours normalisé par
 * `notionPageId` — jamais injecté tel quel dans les chemins de l'API Notion. Le titre est relu chez
 * Notion, pas fourni par le client.
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
  connectionId: z.string().min(1).optional(),
})
