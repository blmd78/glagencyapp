import { z } from 'zod'

/**
 * Planning journalier — schémas PARTAGÉS dialog (RHF + zodResolver) / server actions,
 * même patron que features/members/schema.ts et features/marketing/schema.ts.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure au format HH:MM')

/** « Titre : détail » (séparateur AVEC espaces, comme les puces), une tâche par ligne. */
export const parseAnnexes = (text: string): { title: string; detail: string }[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(' : ')
      return i === -1
        ? { title: l, detail: '' }
        : { title: l.slice(0, i).trim(), detail: l.slice(i + 3).trim() }
    })

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
  badge: z.string().trim().max(20, '20 caractères max'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide'),
})

/** Formulaire d'un bloc horaire — mêmes limites que le serveur (pas de rejet opaque). */
export const blockForm = blockFields
  .extend({
    /** Une puce par ligne — converti en tableau au submit. */
    bulletsText: z.string().superRefine((text, ctx) => {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length > 12) ctx.addIssue({ code: 'custom', message: '12 puces max' })
      if (lines.some((l) => l.length > 300))
        ctx.addIssue({ code: 'custom', message: '300 caractères max par puce' })
    }),
  })
  .refine(timesDiffer, timesDifferMsg)
export type BlockForm = z.infer<typeof blockForm>

/** Côté serveur : bloc validé, puces déjà en tableau. */
export const blockInput = blockFields
  .extend({
    id: z.uuid().nullable(), // null = création
    profileId: z.uuid(),
    bullets: z.array(z.string().trim().min(1).max(300)).max(12),
  })
  .refine(timesDiffer, timesDifferMsg)

/** Une tâche par ligne, format « Titre : détail » — mêmes limites que metaInput. */
const annexesText = z.string().superRefine((text, ctx) => {
  const items = parseAnnexes(text)
  if (items.length > 12) ctx.addIssue({ code: 'custom', message: '12 tâches max' })
  if (items.some((a) => a.title.length > 80))
    ctx.addIssue({ code: 'custom', message: 'Titre : 80 caractères max' })
  if (items.some((a) => a.detail.length > 300))
    ctx.addIssue({ code: 'custom', message: 'Détail : 300 caractères max' })
})

/** Formulaire des métadonnées (priorité, note de pause, tâches annexes). */
export const metaForm = z.object({
  priorityTitle: z.string().trim().max(80, '80 caractères max'),
  priorityBody: z.string().trim().max(500, '500 caractères max'),
  priorityForbidden: z.string().trim().max(200, '200 caractères max'),
  priorityAllowed: z.string().trim().max(120, '120 caractères max'),
  pauseNote: z.string().trim().max(200, '200 caractères max'),
  annexesText,
  annexNote: z.string().trim().max(300, '300 caractères max'),
})
export type MetaForm = z.infer<typeof metaForm>

export const metaInput = metaForm.omit({ annexesText: true }).extend({
  profileId: z.uuid(),
  annexes: z.array(z.object({ title: z.string().max(80), detail: z.string().max(300) })).max(12),
})
