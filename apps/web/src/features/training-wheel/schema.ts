import { z } from 'zod'
import { requiredInt } from '@/lib/form-fields'

// Schémas PARTAGÉS dialog admin (RHF + zodResolver) / Server Actions (runAction). Zod v4.
// Longueurs alignées sur les `check` SQL de 0122 (titre 1..60). Les poids sont des ENTIERS :
// un poids décimal ne casserait rien mathématiquement mais rend les % illisibles, et la config
// GLA d'origine n'en a jamais eu.

// `requiredInt` et pas `z.coerce.number()` : un poids VIDÉ se coerçait en 0 et s'enregistrait
// tel quel — le secteur (ou le lot) sortait du tirage sans le moindre message. Vide = refus.
const weight = requiredInt(0, 1000, { required: 'Poids requis', invalid: 'Poids invalide', integer: 'Poids entier', min: 'Poids ≥ 0', max: 'Poids ≤ 1000' })
const label = z.string().trim().min(1, 'Libellé requis').max(60, '60 caractères max')

export const sectorForm = z.object({ label, weight, lose: z.boolean() })

export const prizeForm = z.object({
  label,
  weight,
  // '' → null (champ vide = lot non monétaire, ex. « Day off supplémentaire ») ; sinon € ≥ 0.
  // Vide testé APRÈS `trim()` : `'  '` (champ effacé, espace laissé) passait le `v === ''` puis
  // se faisait coercer en 0 — un lot annoncé « non monétaire » valait 0 €.
  amountEur: z.preprocess(
    (v) => ((typeof v === 'string' && v.trim() === '') || v == null ? null : v),
    z.coerce.number({ error: 'Montant invalide' }).min(0, 'Montant ≥ 0').max(100000, 'Montant trop élevé').nullable(),
  ),
})

/**
 * Les deux refines sont l'invariant qui protège le tirage : `pickWeighted` THROW si la somme des
 * poids vaut 0, et une roue 100 % perdante ne serait pas une roue. Le `path` pose l'erreur sous la
 * liste concernée dans le dialog.
 */
export const wheelConfigForm = z
  .object({
    title: z.string().trim().min(1, 'Titre requis').max(60, '60 caractères max'),
    sectors: z.array(sectorForm).min(1, 'Au moins un secteur').max(12, '12 secteurs max'),
    prizes: z.array(prizeForm).min(1, 'Au moins un lot').max(20, '20 lots max'),
  })
  .refine((c) => c.sectors.some((s) => !s.lose && s.weight > 0), {
    message: 'Il faut au moins un secteur gagnant avec un poids > 0',
    path: ['sectors'],
  })
  .refine((c) => c.prizes.some((p) => p.weight > 0), {
    message: 'Il faut au moins un lot avec un poids > 0',
    path: ['prizes'],
  })

/** Sortie validée (ce que reçoit l'action). */
export type WheelConfigInput = z.infer<typeof wheelConfigForm>
/** Entrée du formulaire (inputs HTML : tout arrive en chaîne) — type de `useForm`. */
export type WheelConfigFormValues = z.input<typeof wheelConfigForm>

export const spinInput = z.object({ ticketId: z.uuid() })
