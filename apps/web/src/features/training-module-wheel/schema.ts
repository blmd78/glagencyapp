import { z } from 'zod'
import { requiredInt } from '@/lib/form-fields'

// Schéma PARTAGÉ dialog admin (RHF + zodResolver) / Server Action (runAction). Zod v4.
// Longueurs alignées sur les `check` SQL de 0136 (titre 1..60).
//
// `requiredInt` et pas `z.coerce.number()` : un poids VIDÉ se coercerait en 0 et s'enregistrerait
// tel quel — le secteur sortirait du tirage sans le moindre message (piège déjà rencontré sur la
// roue nº 1). Vide = refus.
const weight = requiredInt(0, 1000, {
  required: 'Poids requis', invalid: 'Poids invalide', integer: 'Poids entier',
  min: 'Poids ≥ 0', max: 'Poids ≤ 1000',
})
const label = z.string().trim().min(1, 'Libellé requis').max(60, '60 caractères max')

// Le montant passe par `requiredInt` LUI AUSSI, et c'est obligatoire — pas par `z.coerce.number()`.
// Deux raisons, toutes deux documentées dans `lib/form-fields.ts` :
//   1. une chaîne VIDE se coerce en `0` : le secteur s'enregistrerait à 0 € sans un mot d'erreur ;
//   2. le schéma est parsé DEUX FOIS sur deux formes différentes — `zodResolver` rend des NOMBRES
//      à `handleSubmit`, et c'est cet objet-là que le client envoie à la Server Action, qui
//      revalide avec le MÊME schéma. Un validateur qui n'accepterait que des chaînes rejetterait
//      donc sa propre sortie côté serveur (« Saisie invalide » à l'enregistrement, sans plus).
//      `requiredInt` porte l'union `string | number` qui règle ça.
// Conséquence assumée : les montants sont des EUROS ENTIERS. Le barème (6/7/8 €) l'est ; le jour
// où un montant décimal sera demandé, ajouter un `requiredNumber` à `form-fields.ts`.
const amountEur = requiredInt(0, 1000, {
  required: 'Montant requis', invalid: 'Montant invalide', integer: 'Montant en euros entiers',
  min: 'Montant ≥ 0', max: 'Montant ≤ 1000 €',
})

export const moduleSegmentForm = z.object({ label, weight, amountEur })

export const moduleWheelConfigForm = z
  .object({
    title: z.string().trim().min(1, 'Titre requis').max(60, '60 caractères max'),
    segments: z.array(moduleSegmentForm).min(1, 'Au moins un secteur').max(12, '12 secteurs max'),
  })
  // L'invariant qui protège le tirage : `pickWeighted` THROW si la somme des poids vaut 0.
  .refine((c) => c.segments.some((s) => s.weight > 0), {
    message: 'Il faut au moins un secteur avec un poids > 0',
    path: ['segments'],
  })

/** Sortie validée (ce que reçoit l'action). */
export type ModuleWheelConfigInput = z.infer<typeof moduleWheelConfigForm>
/** Entrée du formulaire (inputs HTML : tout arrive en chaîne) — type de `useForm`. */
export type ModuleWheelConfigFormValues = z.input<typeof moduleWheelConfigForm>
