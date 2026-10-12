import { z } from 'zod'
import { DEFAULT_URGENCY, URGENCIES } from './urgency'

/** Schémas partagés client/serveur de la to-do (Zod v4 : `z.uuid()`, `z.flattenError()`). */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
const owner = z.uuid()

/** Titre, description et urgence d'une tâche (#160) — les bornes sont celles des `check` de 0192. */
const title = z.string().trim().min(1, 'Écris quelque chose').max(200, '200 caractères maximum')
const description = z.string().trim().max(2000, '2000 caractères maximum')
const urgency = z.enum(URGENCIES)

/** Identifiant de tâche : uuid réel, ou occurrence virtuelle d'une habitude. */
const taskId = z.union([z.uuid(), z.string().regex(/^habit:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/)])

export const addTaskInput = z.object({
  ownerId: owner,
  date: day,
  /**
   * VIDE = « sans section », et c'en est une. C'est la première option de leur sélecteur
   * d'habitude (todo.html:1365) et le défaut de `habitInput` — mais `min(1)` la refusait ici,
   * alors que `get-week.ts:109` fait bien apparaître son groupe dans la semaine. Le « + » de ce
   * groupe répondait donc « Saisie invalide », et un déposant s'y retrouvait sans AUCUN point
   * d'entrée sur la journée : le groupe d'accueil de `DayColumn` ne se pose que sur une journée
   * SANS groupe, or celui-ci en est un. `category` est du texte libre et non une clé étrangère
   * vers les sections (0127:44-45) : la chaîne vide y est une valeur comme une autre.
   */
  category: z.string().trim().max(60),
  label: title,
  /** Facultative (#160) : le titre seul reste une tâche complète. */
  description: description.default(''),
  urgency: urgency.default(DEFAULT_URGENCY),
  /**
   * Tâche « 1:1 avec un chatter » : cocher exigera un compte-rendu et créera une session dans sa
   * fiche. `null` = tâche ordinaire. Leur champ s'intitule « Session 1:1 avec (impose un bilan
   * pour cocher) » (todo.html:1331).
   */
  chatterId: z.uuid().nullable().default(null),
})

/**
 * La pop-up d'une tâche (#160) : ce qu'on y modifie — titre, description, urgence et jour. Ni la
 * section (le glisser-déposer s'en charge), ni le 1:1 (décision de Benoit du 2026-10-12).
 */
export const taskForm = z.object({ label: title, description, urgency, date: day })
export type TaskFormValues = z.infer<typeof taskForm>

/** Même saisie que `taskForm`, plus la tâche visée — réelle ou occurrence virtuelle d'habitude. */
export const updateTaskInput = taskForm.extend({ ownerId: owner, taskId })


export const toggleTaskInput = z.object({ ownerId: owner, taskId, done: z.boolean() })

export const deleteTaskInput = z.object({ ownerId: owner, taskId })

/**
 * Modifier une habitude : son intitulé (`prompt('Renommer l'habitude :')` chez eux), et depuis le
 * #160 sa description et son urgence, que chaque occurrence reprend.
 */
export const updateHabitInput = z.object({
  ownerId: owner,
  habitId: z.uuid(),
  label: z.string().trim().min(1, 'Il faut un intitulé.').max(200),
  description: description.default(''),
  urgency: urgency.default(DEFAULT_URGENCY),
})
export const setHabitActiveInput = z.object({ ownerId: owner, habitId: z.uuid(), active: z.boolean() })

export const moveTaskInput = z.object({
  ownerId: owner,
  taskId,
  date: day,
  /** Même « sans section » qu'à l'ajout : on doit pouvoir y glisser une tâche comme ailleurs. */
  category: z.string().trim().max(60),
  /**
   * #161 — la tâche (réelle ou occurrence virtuelle) au-dessus de laquelle on l'a lâchée ; `null` =
   * en bas de la section, ce que faisait tout glisser jusque-là.
   */
  beforeId: taskId.nullable().default(null),
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
  /** Facultative — leur sélecteur propose « Sans section » en première option (todo.html:1365). */
  category: z.string().trim().max(60).default(''),
  label: z.string().trim().min(1, 'Écris quelque chose').max(200),
  description: description.default(''),
  urgency: urgency.default(DEFAULT_URGENCY),
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
