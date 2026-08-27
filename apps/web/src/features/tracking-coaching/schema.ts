import { z } from 'zod'

/** Schémas partagés du suivi chatters (Zod v4). */

const chatter = z.uuid()

export const rateInput = z.object({
  chatterId: chatter,
  skillId: z.uuid(),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(2000).default(''),
  sessionId: z.uuid().nullable().default(null),
})

/**
 * Une session 1:1 s'enregistre D'UN BLOC — c'est ce que dit leur écran (« tout est enregistré d'un
 * bloc ») : la note sur 20, le compte rendu, le mot général et les étoiles de chaque compétence
 * partent ensemble. Enregistrer par morceaux laisserait des sessions à moitié notées.
 */
export const sessionInput = z.object({
  chatterId: chatter,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  /** Sur 20, saisie à la main. Vide = session tenue sans note. */
  score: z.number().min(0, 'Entre 0 et 20').max(20, 'Entre 0 et 20').nullable().default(null),
  summary: z.string().max(8000).default(''),
  general: z.string().max(8000).default(''),
  ratings: z.array(z.object({ skillId: z.uuid(), stars: z.number().int().min(1).max(5) })).max(50).default([]),
})

export const updateSessionInput = z.object({
  sessionId: z.uuid(),
  score: z.number().min(0).max(20).nullable().default(null),
  summary: z.string().max(8000).default(''),
  general: z.string().max(8000).default(''),
})

export const deleteSessionInput = z.object({ sessionId: z.uuid() })

export const addNoteInput = z.object({
  chatterId: chatter,
  body: z.string().trim().min(1, 'Écris quelque chose').max(8000),
})

export const updateNoteInput = z.object({
  noteId: z.uuid(),
  body: z.string().trim().min(1, 'Écris quelque chose').max(8000),
})

export const deleteNoteInput = z.object({ noteId: z.uuid() })

export const skillInput = z.object({
  skillId: z.uuid().nullable().default(null),
  name: z.string().trim().min(1, 'Nom requis').max(80),
  description: z.string().max(2000).default(''),
})

export const archiveSkillInput = z.object({ skillId: z.uuid() })

// ============================================================ formulaires (client)
//
// Distincts des schémas d'ACTION ci-dessus : un `<input>` rend toujours du texte. Ces schémas-là
// valident la saisie ET la transforment vers ce que l'action attend — la note « 13,5 » devient
// 13.5, un champ vide devient `null`. Sans cette séparation, on validerait un nombre là où le
// navigateur donne une chaîne, et `zodResolver` refuserait tout.

/** Note de session : vide = pas de note ; virgule acceptée, c'est ce que les gens tapent. */
const scoreField = z
  .string()
  .trim()
  .refine((v) => v === '' || !Number.isNaN(Number(v.replace(',', '.'))), 'Chiffre attendu (ex. 13,5)')
  .refine((v) => {
    if (v === '') return true
    const n = Number(v.replace(',', '.'))
    return n >= 0 && n <= 20
  }, 'Entre 0 et 20')
  .transform((v) => (v === '' ? null : Number(v.replace(',', '.'))))

export const sessionForm = z.object({
  score: scoreField,
  summary: z.string().max(8000),
  general: z.string().max(8000),
})
export type SessionFormInput = z.input<typeof sessionForm>
export type SessionFormValues = z.output<typeof sessionForm>

export const skillForm = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(80, '80 caractères maximum'),
  description: z.string().max(2000),
})
export type SkillFormInput = z.input<typeof skillForm>
export type SkillFormValues = z.output<typeof skillForm>
