import { z } from 'zod'

/**
 * Planning journalier — schémas PARTAGÉS dialog (RHF + zodResolver) / server actions,
 * même patron que features/members/schema.ts et features/marketing-staff/schema.ts.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure au format HH:MM')

// Fin ≠ début sur les DEUX schémas (fin < début = passage de minuit, voulu — cf.
// durationMin ; début == fin compterait 24 h). Zod 4 interdit .omit() après .refine()
// → blockForm et blockInput dérivent d'un objet de base non raffiné.
const timesDiffer = (v: { timeStart: string; timeEnd: string }) => v.timeStart !== v.timeEnd
const timesDifferMsg = { message: 'La fin doit différer du début', path: ['timeEnd'] }

const blockFields = z.object({
  section: z.enum(['matin', 'apres_midi', 'soir']),
  timeStart: hhmm,
  timeEnd: hhmm,
  title: z.string().trim().min(1, 'Le titre est requis').max(120, '120 caractères max'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide'),
})

const dayEnum = z.enum(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])

/** Puces « une par ligne » avec limites — partagé par le bloc ET chaque catégorie. */
const bulletsText = z.string().superRefine((text, ctx) => {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length > 12) ctx.addIssue({ code: 'custom', message: '12 puces max' })
  if (lines.some((l) => l.length > 300))
    ctx.addIssue({ code: 'custom', message: '300 caractères max par puce' })
})
const bulletsArray = z.array(z.string().trim().min(1).max(300)).max(12)

/** Formulaire d'un bloc horaire — mêmes limites que le serveur (pas de rejet opaque). */
export const blockForm = blockFields
  .extend({
    /** Une puce par ligne — converti en tableau au submit. */
    bulletsText,
    /** Catégories (sous-titre + badge + puces). Non vide → remplace le contenu plat. */
    categories: z
      .array(
        z.object({
          subtitle: z.string().trim().min(1, 'Sous-titre requis').max(60, '60 caractères max'),
          badge: z.string().trim().max(20, '20 caractères max'),
          bulletsText,
        }),
      )
      .max(6, '6 catégories max'),
    /** Jours autorisés (vide = tous les jours ; 7 valeurs distinctes possibles au plus). */
    days: z.array(dayEnum).max(7),
  })
  .refine(timesDiffer, timesDifferMsg)
export type BlockForm = z.infer<typeof blockForm>

/** Côté serveur : bloc validé, puces déjà en tableau. */
export const blockInput = blockFields
  .extend({
    id: z.uuid().nullable(), // null = création
    profileId: z.uuid(),
    bullets: bulletsArray,
    categories: z
      .array(
        z.object({
          subtitle: z.string().trim().min(1).max(60),
          badge: z.string().trim().max(20),
          bullets: bulletsArray,
        }),
      )
      .max(6),
    days: z.array(dayEnum).max(7),
  })
  .refine(timesDiffer, timesDifferMsg)
