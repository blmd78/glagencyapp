import { z } from 'zod'
import { isDayInWindow } from '@/lib/periods'
import { POLICE_ERRORS } from '@/lib/types/police-errors'
import { SHIFTS } from './types'

// Briques Zod — les ENTRÉES d'action (serveur) les composent, et les schémas de FORM client
// plus bas en DÉRIVENT (le form manipule le montant en TEXTE, il ne peut pas être le même
// schéma ; mais chaque contrainte n'est écrite qu'UNE fois — l'audit 2026-08-06 en avait
// trouvé trois copies de la borne de note et deux de la règle de montant).

const errorKeyZ = z.enum(POLICE_ERRORS.map((e) => e.key) as [string, ...string[]])
const shiftZ = z.enum(SHIFTS)
// `day` borné à la fenêtre 14 j (M2) — défense en profondeur : une saisie directe (hors sélecteur)
// ne peut pas dater une sanction d'une date arbitraire.
const dayZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDayInWindow, 'Date hors de la période autorisée')
const uuidZ = z.uuid()
const amountEurZ = z.number().min(0).max(100_000)
// Borne MIROIR du check SQL `police_entries_note_check` (0108).
const noteZ = z.string().max(500).optional()
/** Montant saisi en TEXTE par le form (virgule tolérée) : strictement positif. */
const montantTexteValide = (v: string) => Number(v.replace(',', '.')) > 0

// ── Entrées des Server Actions
export const warningInput = z.object({
  day: dayZ,
  chatterId: uuidZ,
  errorKey: errorKeyZ,
  shift: shiftZ.optional(),
})

export const malusInput = z.object({
  day: dayZ,
  chatterId: uuidZ,
  errorKey: errorKeyZ.optional(),
  amountEur: amountEurZ,
  note: noteZ,
  shift: shiftZ.optional(),
})

/** Édition COMPLÈTE d'une entrée (le crayon rouvre le dialog de saisie pré-rempli — demande
 *  Benoit 2026-08-17, remplace l'édition partielle montant+note). Le `kind` se déduit du
 *  montant, comme à la pose (0 → avertissement, > 0 → malus). `day` : FORMAT seul — la règle
 *  de fenêtre vit dans le handler (la date D'ORIGINE d'une vieille sanction doit rester
 *  acceptée telle quelle, seule une RE-datation est bornée aux 14 j). */
export const updateEntryInput = z
  .object({
    id: uuidZ,
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
    chatterId: uuidZ,
    errorKey: errorKeyZ.optional(),
    amountEur: amountEurZ,
    note: noteZ,
    shift: shiftZ.optional(),
  })
  .refine((v) => v.amountEur > 0 || !!v.errorKey, {
    message: 'Un avertissement doit porter un type d’erreur.',
    path: ['errorKey'],
  })

// ── Schéma du FORM client (dialog de saisie, création ET édition) : montant en texte, vide =
// simple avertissement. `day` : FORMAT seul — le calendrier borne déjà la sélection à la
// fenêtre 14 j, et le serveur re-vérifie (création : `dayZ` strict ; édition : fenêtre sauf
// date inchangée). Un refine fenêtre ici bloquerait l'édition d'une sanction ancienne.
export const controlFormSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  chatterId: z.string().min(1, 'Choisis un chatter.'),
  errorKey: z.string().min(1, 'Choisis un type d’erreur.'),
  shift: z.string().optional(),
  amount: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || montantTexteValide(v), {
      message: 'Montant invalide (laisse vide pour un simple avertissement).',
    }),
  note: noteZ,
})
export type ControlForm = z.infer<typeof controlFormSchema>
