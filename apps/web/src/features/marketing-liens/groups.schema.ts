import { z } from 'zod'
import { normalizeKeyword } from '@glagency/core'

// Partagé par le formulaire (RHF) ET les Server Actions — règle archi-web.

/** Une clé est un identifiant technique : elle voyage dans `mkt_links.type` et dans l'URL. */
const key = z
  .string()
  .trim()
  .min(2, 'Clé trop courte')
  .max(40)
  .regex(/^[a-z0-9_]+$/, 'Minuscules, chiffres et « _ » uniquement')

/**
 * Une liste saisie « snap, snapchat » → `['snap', 'snapchat']`, enregistrée sous la forme même
 * où la règle compare (`normalizeKeyword` : sans majuscules, accents ni séparateurs). Sans ça,
 * « FB Ads » saisi à la main ne reconnaîtrait jamais rien.
 *
 * Coupée aux VIRGULES seulement : l'espace fait partie du mot (« fb ads » = « fbads »), le couper
 * donnerait « fb » tout court, qui reconnaîtrait n'importe quoi.
 */
const keywords = z
  .string()
  .max(400)
  .transform((raw) => [...new Set(raw.split(/[,;]/).map(normalizeKeyword).filter(Boolean))])
  .refine((kws) => kws.length <= 20, { message: '20 mots au plus' })
  .refine((kws) => kws.every((k) => /^[a-z0-9]{1,30}$/.test(k)), {
    message: 'Lettres et chiffres, séparés par des virgules',
  })

export const createGroupSchema = z.object({
  key,
  label: z.string().trim().min(1, 'Nom requis').max(40),
  contains: keywords,
  startsWith: keywords,
  words: keywords,
  color: z.string().trim().max(40),
  priority: z.coerce.number().int().min(1).max(998),
})
/**
 * Type d'ENTRÉE du formulaire (convention compta/schema.ts) : les mots-clés y sont des CHAÎNES,
 * `priority` passe par `z.coerce` — l'entrée diffère de la sortie.
 */
export type GroupFormValues = z.input<typeof createGroupSchema>
/** Sortie du resolver (mots-clés en tableaux) — ce que `handleSubmit` valide avant envoi. */
export type GroupFormOutput = z.output<typeof createGroupSchema>

/** La clé identifie le groupe modifié — mêmes champs qu'à la création. */
export const updateGroupSchema = createGroupSchema

export const deleteGroupSchema = z.object({ key })
