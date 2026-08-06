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

export const updateMalusInput = z.object({
  id: uuidZ,
  amountEur: amountEurZ,
  note: noteZ,
})

// ── Schéma du FORM client (ControlPanel) : montant en texte, vide = simple avertissement.
export const controlFormSchema = z.object({
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

// ── Édition inline d'un malus (montant + note).
export const malusEditFormSchema = z.object({
  amount: z.string().refine(montantTexteValide, 'Montant invalide (> 0).'),
  note: noteZ,
})
export type MalusEditForm = z.infer<typeof malusEditFormSchema>
