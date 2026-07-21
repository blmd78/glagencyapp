import { z } from 'zod'
import { isDayInWindow } from '@/lib/periods'
import { POLICE_ERRORS, SHIFTS } from './types'

// Schémas Zod PARTAGÉS client (form RHF) ↔ serveur (actions safeParse) — source unique.

export const errorKeyZ = z.enum(POLICE_ERRORS.map((e) => e.key) as [string, ...string[]])
export const shiftZ = z.enum(SHIFTS)
// `day` borné à la fenêtre 14 j (M2) — défense en profondeur : une saisie directe (hors sélecteur)
// ne peut pas dater une sanction d'une date arbitraire.
const dayZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isDayInWindow, 'Date hors de la période autorisée')
const uuidZ = z.uuid()
const amountEurZ = z.number().min(0).max(100_000)
const noteZ = z.string().max(500).optional()

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
  chatterId: z.string().min(1, 'Choisis un chatteur.'),
  errorKey: z.string().min(1, 'Choisis un type d’erreur.'),
  shift: z.string().optional(),
  amount: z
    .string()
    .optional()
    .refine((v) => !v?.trim() || Number(v.replace(',', '.')) > 0, {
      message: 'Montant invalide (laisse vide pour un simple avertissement).',
    }),
  note: z.string().max(500).optional(),
})
export type ControlForm = z.infer<typeof controlFormSchema>

// ── Édition inline d'un malus (montant + note).
export const malusEditFormSchema = z.object({
  amount: z.string().refine((v) => Number(v.replace(',', '.')) > 0, 'Montant invalide (> 0).'),
  note: z.string().max(500).optional(),
})
export type MalusEditForm = z.infer<typeof malusEditFormSchema>
