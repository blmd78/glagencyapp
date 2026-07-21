import { z } from 'zod'

// Schéma PARTAGÉ client (RHF) ↔ serveur (runAction). L'en-tête + les lignes chatteur en une
// seule soumission (upsert atomique de la fiche du soir).
const optionalText = (max: number, msg: string) =>
  z.string().trim().max(max, msg).transform((v) => (v === '' ? null : v)).nullable()

const count = z.coerce.number().int().min(0, 'Doit être ≥ 0').default(0)

export const reportInput = z.object({
  creatorId: z.uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  ca: count,
  nonTraitees: count,
  absents: count,
  alerte: optionalText(2000, 'Alerte trop longue'),
  lines: z
    .array(
      z.object({
        chatterId: z.uuid(),
        aMarche: optionalText(2000, 'Note trop longue'),
        aRegler: optionalText(2000, 'Note trop longue'),
      }),
    )
    .max(100, 'Trop de chatteurs'),
})
export type ReportInput = z.infer<typeof reportInput>
// Type d'ENTRÉE du formulaire (le schéma a des `.default()`/`.transform()` → input ≠ output).
// Sert de `TFieldValues` à `useForm`/`Controller`/`useFieldArray` côté client (même patron que
// `BilanFormInput` dans insights/schema.ts).
export type ReportFormValues = z.input<typeof reportInput>

export const deleteReportInput = z.object({ id: z.uuid() })
