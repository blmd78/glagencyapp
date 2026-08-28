'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { assertOwner, assertOwnerOrAdmin, TODO_PATH } from './actions-shared'
import {
  addTaskInput, deleteHabitInput, deleteSectionInput, deleteTaskInput,
  habitInput, moveTaskInput, renameHabitInput, renameSectionInput, sectionInput,
  setHabitActiveInput, toggleTaskInput,
} from './schema'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
import { getProfile } from '@/lib/auth'

/** Le chatteur visé est-il dans le périmètre modèles de l'appelant ? (message du legacy) */
async function assertChatterInScope(callerId: string, chatterId: string): Promise<void> {
  const profile = await getProfile()
  const scope = await getCreatorScope(callerId, profile?.baseRole ?? 'chatteur')
  if (!(await isChatterInScope(scope, chatterId))) {
    throw new BusinessError("Ce chatter n'est pas dans ton périmètre.")
  }
}

/**
 * Mutations de la to-do hebdomadaire.
 *
 * ÉCRITURES EN SERVICE-ROLE APRÈS GARDE, comme toute la face Formation : la migration 0127 ne pose
 * aucune politique d'écriture, donc il n'existe qu'UN chemin d'écriture, celui qui passe par ici.
 *
 * PROPRIÉTÉ : chacun gère sa to-do ; un admin peut agir sur n'importe laquelle. La vérification
 * est faite UNE fois, dans le handler (`assertOwner`) — jamais en double dans `guard`, ce que la
 * checklist des guidelines interdit explicitement.
 */

/** Une occurrence virtuelle d'habitude : `habit:<uuid>:<date>`. */
function parseVirtual(taskId: string): { habitId: string; date: string } | null {
  const m = /^habit:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(taskId)
  return m ? { habitId: m[1] as string, date: m[2] as string } : null
}

/**
 * Transforme une occurrence virtuelle en vraie ligne, et rend son id.
 * C'est LE moment où une habitude existe en base : au premier geste, jamais à l'affichage.
 */
async function materialize(ownerId: string, taskId: string): Promise<string> {
  const virt = parseVirtual(taskId)
  if (!virt) return taskId

  const admin = createAdminClient()
  const { data: habit, error } = await admin
    .from('tracker_todo_habits')
    .select('category, label')
    .eq('id', virt.habitId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!habit) throw new BusinessError('Cette habitude a été supprimée entre-temps.')

  const { data: created, error: insErr } = await admin
    .from('tracker_todo_tasks')
    .insert({ owner_id: ownerId, date: virt.date, category: habit.category, label: habit.label })
    .select('id')
    .single()
  if (insErr) throw new Error(insErr.message)
  return created.id
}

// ============================================================ tâches

export async function addTask(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: addTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const callerId = await assertOwnerOrAdmin(d.ownerId)
      // Le périmètre testé est celui de CELUI QUI DÉPOSE, pas du titulaire de la semaine — c'est
      // la nuance du legacy : « Viser un chatter hors de son périmètre n'a pas de sens : la tâche
      // produirait un compte-rendu qu'il n'a pas le droit d'écrire » (routes.js.txt:291-295).
      if (d.chatterId) await assertChatterInScope(callerId, d.chatterId)
      const admin = createAdminClient()
      const { error } = await admin.from('tracker_todo_tasks').insert({
        owner_id: d.ownerId,
        date: d.date,
        category: d.category,
        label: d.label,
        chatter_id: d.chatterId,
        // Trace de la hiérarchie : `null` quand on écrit chez soi, pour ne pas marquer d'un
        // « déposée par » toutes les tâches qu'on se donne soi-même.
        created_by: callerId === d.ownerId ? null : callerId,
      })
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function toggleTask(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: toggleTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const id = await materialize(d.ownerId, d.taskId)
      const admin = createAdminClient()
      // COCHER un 1:1 ne se fait pas ici : il faut passer par le bilan (`completeOneToOne`), qui
      // exige le compte-rendu et crée la session. Décocher, en revanche, est direct quel que soit
      // le type — comme leur `toggle()` (todo.html:1447-1456).
      if (d.done) {
        const { data: t, error: tErr } = await admin
          .from('tracker_todo_tasks').select('chatter_id').eq('id', id).maybeSingle()
        if (tErr) throw new Error(tErr.message)
        if (t?.chatter_id) {
          throw new BusinessError('Cette tâche 1:1 se termine par son bilan, sur la fiche du chatter.')
        }
      }
      const { error } = await admin
        .from('tracker_todo_tasks')
        .update({ done: d.done, done_at: d.done ? new Date().toISOString() : null })
        .eq('id', id)
        .eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function deleteTask(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      // 2e dérogation admin du legacy : « l'admin peut retirer ce qu'il a déposé (ou corriger une
      // erreur) » — `task-delete` est la SEULE suppression qu'il puisse faire chez autrui
      // (routes.js.txt:306-315, qui refait le contrôle à la main au lieu d'utiliser `ownTask`).
      await assertOwnerOrAdmin(d.ownerId)
      // Une occurrence virtuelle n'existe pas en base : `deleteTask` ne la traite pas. C'est
      // `deleteTaskOccurrence` (« Juste aujourd'hui ») qui la matérialise avant de la retirer.
      if (parseVirtual(d.taskId)) throw new BusinessError("Utilise « Juste aujourd'hui » pour cette occurrence.")
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_tasks').delete().eq('id', d.taskId).eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function moveTask(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: moveTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const id = await materialize(d.ownerId, d.taskId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_tasks')
        .update({ date: d.date, category: d.category })
        .eq('id', id)
        .eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

// ============================================================ sections

export async function saveSection(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sectionInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_sections')
        .upsert(
          { owner_id: d.ownerId, name: d.name, weekdays: d.weekdays.join(',') },
          { onConflict: 'owner_id,name' },
        )
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function renameSection(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: renameSectionInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_sections').update({ name: d.to })
        .eq('owner_id', d.ownerId).eq('name', d.from)
      if (error) throw new Error(error.message)
      // `category` est du texte libre côté tâches : le renommage doit les suivre, sinon elles
      // se retrouvent orphelines dans une section fantôme.
      const { error: tErr } = await admin
        .from('tracker_todo_tasks').update({ category: d.to })
        .eq('owner_id', d.ownerId).eq('category', d.from)
      if (tErr) throw new Error(tErr.message)
      const { error: hErr } = await admin
        .from('tracker_todo_habits').update({ category: d.to })
        .eq('owner_id', d.ownerId).eq('category', d.from)
      if (hErr) throw new Error(hErr.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function deleteSection(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteSectionInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_sections').delete().eq('owner_id', d.ownerId).eq('name', d.name)
      if (error) throw new Error(error.message)
      if (d.withTasks) {
        const { error: tErr } = await admin
          .from('tracker_todo_tasks').delete().eq('owner_id', d.ownerId).eq('category', d.name)
        if (tErr) throw new Error(tErr.message)
      }
      revalidatePath(TODO_PATH)
    },
  })
}

// ============================================================ habitudes

export async function saveHabit(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: habitInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { error } = await admin.from('tracker_todo_habits').insert({
        owner_id: d.ownerId,
        category: d.category,
        label: d.label,
        weekdays: d.weekdays.join(','),
      })
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function deleteHabit(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteHabitInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_habits').delete().eq('id', d.habitId).eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}


/** Renomme une habitude — `prompt('Renommer l'habitude :')` chez eux, un champ chez nous. */
export async function renameHabit(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: renameHabitInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const { error } = await createAdminClient()
        .from('tracker_todo_habits')
        .update({ label: d.label })
        .eq('id', d.habitId)
        .eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

/**
 * Met une habitude en pause, ou la reprend. Leur endpoint `habit-active` existe mais AUCUN bouton
 * ne l'appelle dans la page capturée — seule la classe `off` en montre l'effet. On expose le geste :
 * mettre une habitude en pause sans perdre son historique est plus utile que de la supprimer.
 */
export async function setHabitActive(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: setHabitActiveInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const { error } = await createAdminClient()
        .from('tracker_todo_habits')
        .update({ active: d.active })
        .eq('id', d.habitId)
        .eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

/**
 * « Juste aujourd'hui » : retire UNE occurrence d'habitude sans toucher au gabarit.
 *
 * L'occurrence n'existe pas en base tant qu'on n'y a pas touché : on la matérialise d'abord, puis
 * on la supprime. La ligne persistée devient la trace « ce jour-là, la tâche a été retirée », et
 * l'habitude continue de produire les autres jours — c'est la première des deux issues de leur
 * fenêtre (todo.html:1466).
 */
export async function deleteTaskOccurrence(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const id = await materialize(d.ownerId, d.taskId)
      const { error } = await createAdminClient()
        .from('tracker_todo_tasks').delete().eq('id', id).eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}
