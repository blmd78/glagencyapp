import { z } from 'zod'
import { isDayInWindow } from '@/lib/periods'

// Schéma PARTAGÉ client (RHF) ↔ serveur (runAction). L'en-tête + les lignes chatteur en une
// seule soumission (upsert atomique de la fiche du soir).
const optionalText = (max: number, msg: string) =>
  z.string().trim().max(max, msg).transform((v) => (v === '' ? null : v)).nullable()

// `.max` = garde-fou d'intégrité (M3) : borne au-dessus de toute valeur réelle, empêche une saisie
// absurde (ex. 2 milliards) qui ne serait sinon limitée que par l'`integer` Postgres.
const count = z.coerce.number().int().min(0, 'Doit être ≥ 0').max(10_000_000, 'Valeur trop élevée').default(0)

export const reportInput = z.object({
  creatorId: z.uuid('Choisis un modèle'),
  // `day` vient de l'en-tête (fenêtre du sélecteur) ; on le borne AUSSI au schéma (M2) — défense en
  // profondeur contre un appel direct de l'action avec une date arbitraire (hors fenêtre 14 j).
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
    .refine(isDayInWindow, 'Date hors de la période autorisée'),
  ca: count,
  nonTraitees: count,
  absents: count,
  alerte: optionalText(2000, 'Alerte trop longue'),
  lines: z
    .array(
      z.object({
        chatterId: z.uuid('Choisis un chatteur'),
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

export const deleteReportInput = z.object({ id: z.uuid('Identifiant invalide') })
