import { z } from 'zod'

/** Schémas partagés client/serveur de la to-do (Zod v4 : `z.uuid()`, `z.flattenError()`). */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
const owner = z.uuid()

/** Identifiant de tâche : uuid réel, ou occurrence virtuelle d'une habitude. */
const taskId = z.union([z.uuid(), z.string().regex(/^habit:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/)])

export const addTaskInput = z.object({
  ownerId: owner,
  date: day,
  category: z.string().trim().min(1, 'Section requise').max(60),
  label: z.string().trim().min(1, 'Écris quelque chose').max(200, '200 caractères maximum'),
})

export const toggleTaskInput = z.object({ ownerId: owner, taskId, done: z.boolean() })

export const deleteTaskInput = z.object({ ownerId: owner, taskId })

export const moveTaskInput = z.object({
  ownerId: owner,
  taskId,
  date: day,
  category: z.string().trim().min(1).max(60),
})

export const sectionInput = z.object({
  ownerId: owner,
  name: z.string().trim().min(1, 'Nom requis').max(60),
  /** Jours ISO de récurrence ; vide = section ponctuelle. */
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
})

export const renameSectionInput = z.object({
  ownerId: owner,
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1, 'Nom requis').max(60),
})

export const deleteSectionInput = z.object({
  ownerId: owner,
  name: z.string().trim().min(1).max(60),
  /** Vrai = on supprime aussi ses tâches. Faux = la section disparaît, les tâches restent. */
  withTasks: z.boolean(),
})

export const habitInput = z.object({
  ownerId: owner,
  category: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1, 'Écris quelque chose').max(200),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1, 'Choisis au moins un jour'),
})

export const deleteHabitInput = z.object({ ownerId: owner, habitId: z.uuid() })

export const dayOffInput = z.object({ ownerId: owner, date: day })

export const notesInput = z.object({
  ownerId: owner,
  week: day,
  body: z.string().max(20_000),
})

export const dailyInput = z.object({
  ownerId: owner,
  date: day,
  focus: z.string().max(4000),
  problem: z.string().max(4000),
  positive: z.string().max(4000),
  negative: z.string().max(4000),
  notes: z.string().max(4000),
})

export const addLinkInput = z.object({
  ownerId: owner,
  label: z.string().trim().min(1, 'Nom requis').max(60),
  url: z.string().trim().min(1, 'Adresse requise').max(500),
})

export const deleteLinkInput = z.object({ ownerId: owner, linkId: z.uuid() })

export type AddTaskInput = z.infer<typeof addTaskInput>
export type DailyInput = z.infer<typeof dailyInput>

// ============================================================ formulaires (client)
//
// Séparés des schémas d'action : ils valident la SAISIE, avec les messages que l'utilisateur lira
// sous le champ plutôt que dans un toast générique.

export const dailyForm = z.object({
  focus: z.string().max(4000, '4000 caractères maximum'),
  problem: z.string().max(4000, '4000 caractères maximum'),
  positive: z.string().max(4000, '4000 caractères maximum'),
  negative: z.string().max(4000, '4000 caractères maximum'),
  notes: z.string().max(4000, '4000 caractères maximum'),
})
export type DailyFormValues = z.infer<typeof dailyForm>

export const notesForm = z.object({
  body: z.string().max(20_000, '20 000 caractères maximum'),
})
export type NotesFormValues = z.infer<typeof notesForm>

export const linkForm = z.object({
  label: z.string().trim().min(1, 'Nom requis').max(60, '60 caractères maximum'),
  url: z.string().trim().min(1, 'Adresse requise').max(500, '500 caractères maximum'),
})
export type LinkFormValues = z.infer<typeof linkForm>
