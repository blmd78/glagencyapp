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
    .array(z.object({ chatterId: z.uuid(), observation: optionalText(2000, 'Note trop longue') }))
    .max(100, 'Trop de chatteurs'),
})
export type ReportInput = z.infer<typeof reportInput>

export const deleteReportInput = z.object({ id: z.uuid() })
