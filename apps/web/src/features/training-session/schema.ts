import { z } from 'zod'
import { requiredInt } from '@/lib/form-fields'

/**
 * Schémas de l'entraînement (composer + actions de cycle de vie).
 *
 * ⚠️ CES BORNES SONT LA RÈGLE **PRODUIT**, plus stricte que le SQL — ce ne sont plus des miroirs.
 * Depuis 0123 (reprise Good Luck Agency), le `check` de `training_messages.body` accepte 200 000
 * caractères et celui de `media_price` accepte 0 : il fallait relâcher la base pour importer 59
 * transcriptions de plus de 1 000 caractères et 196 médias offerts, sans les tronquer (D5).
 * Rien de cela ne doit remonter jusqu'au composer : un chatter écrit 1 000 caractères au plus et
 * ne peut pas offrir un média. Seul l'import écrit des 0 et des corps longs.
 * `training_reports.message` reste 1-2000 des deux côtés.
 */

/** Bornes du prix d'un média verrouillé — UNE déclaration pour le popover (saisie) et le composer. */
const MEDIA_PRICE_MIN = 1
const MEDIA_PRICE_MAX = 10_000

export const sessionIdInput = z.object({ sessionId: z.uuid() })
export const threadIdInput = z.object({ threadId: z.uuid() })

/** Champs du composer : un message texte OU un média verrouillé (prix en €). */
const composerFields = z.object({
  body: z.string().trim().max(1000, '1000 caractères max'),
  // Pas de coerce ici : posé en nombre par le popover « Média » (mediaPriceForm valide la saisie), envoyé en JSON.
  mediaPrice: z
    .number()
    .int('Prix entier')
    .min(MEDIA_PRICE_MIN, 'Prix minimum 1 €')
    .max(MEDIA_PRICE_MAX, 'Prix maximum 10 000 €')
    .nullable(),
})
const textOrMedia = {
  check: (v: { body: string; mediaPrice: number | null }) => v.body.length > 0 || v.mediaPrice != null,
  opts: { message: 'Écris un message ou envoie un média', path: ['body'] },
}

/** Formulaire client (RHF) — sans threadId. */
export const composerForm = composerFields.refine(textOrMedia.check, textOrMedia.opts)
export type ComposerInput = z.infer<typeof composerForm>

/** Entrée de la Server Action `sendMessage`. */
export const sendInput = composerFields.extend({ threadId: z.uuid() }).refine(textOrMedia.check, textOrMedia.opts)

export const reportInput = z.object({
  sessionId: z.uuid(),
  message: z.string().trim().min(1, 'Explique ce qui te semble faux').max(2000, '2000 caractères max'),
})
export type ReportInput = z.infer<typeof reportInput>

/**
 * Popover « Média » : la saisie texte devient le nombre qui alimente `composerFields.mediaPrice`.
 * Mêmes bornes, déclarées UNE fois (avant, les deux listes divergeaient et celle d'ici, sans
 * `{ error }`, rendait un message anglais brut de Zod sur une saisie non numérique).
 */
export const mediaPriceForm = z.object({
  price: requiredInt(MEDIA_PRICE_MIN, MEDIA_PRICE_MAX, { required: 'Prix requis', invalid: 'Prix invalide', integer: 'Prix entier', min: 'Minimum 1 €', max: 'Maximum 10 000 €' }),
})
