'use server'

import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { assertOwner, assertCanAssign, assertCanUnassign, revalidateTodo } from './actions-shared'
import {
  addTaskInput, deleteHabitInput, deleteSectionInput, deleteTaskInput,
  habitInput, moveTaskInput, renameHabitInput, renameSectionInput, sectionInput,
  setHabitActiveInput, toggleTaskInput,
} from './schema'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
import { createClient } from '@/lib/supabase/server'

/** Le chatteur visé est-il dans le périmètre modèles de CE profil-là ? */
async function assertChatterInScope(
  profileId: string,
  baseRole: string,
  chatterId: string,
  message: string,
): Promise<void> {
  const scope = await getCreatorScope(profileId, baseRole)
  if (!(await isChatterInScope(scope, chatterId))) throw new BusinessError(message)
}

/**
 * Rôle EXACT d'un profil — celui de la CIBLE, pas de l'appelant : `getCreatorScope` en a besoin
 * pour savoir s'il faut la borner (elle ne borne que manager/sous-manager/police).
 * Client session : `profiles_self_admin_or_team_read` (0097) laisse tout encadrant lire les profils.
 */
async function baseRoleOf(profileId: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('role').eq('id', profileId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.role ?? 'chatteur'
}

/**
 * Mutations de la to-do hebdomadaire.
 *
 * ÉCRITURES EN SERVICE-ROLE APRÈS GARDE, comme toute la face Formation : la migration 0127 ne pose
 * aucune politique d'écriture, donc il n'existe qu'UN chemin d'écriture, celui qui passe par ici.
 *
 * PROPRIÉTÉ : le travail reste celui de son titulaire (`assertOwner` — coche, déplacement,
 * sections, habitudes, débrief : personne d'autre, admin compris). Deux dérogations seulement, et
 * elles ont chacune leur garde : DÉPOSER une tâche (`assertCanAssign` — admin, ou manager du
 * titulaire) et RETIRER CE QU'ON A DÉPOSÉ (`assertCanUnassign`). La vérification est faite UNE
 * fois, dans le handler — jamais en double dans `guard`, ce que la checklist des guidelines
 * interdit explicitement.
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
      const caller = await assertCanAssign(d.ownerId)
      if (d.chatterId) {
        // DEUX périmètres à satisfaire, et le legacy n'en énonçait qu'un : « Viser un chatter hors
        // de son périmètre n'a pas de sens : la tâche produirait un compte-rendu qu'il n'a pas le
        // droit d'écrire » (routes.js.txt:291-295). Le « il » de cette phrase, c'est le TITULAIRE
        // — c'est lui qui devra rendre le bilan. Tant que seul l'admin déposait, sa règle était
        // sans effet (son périmètre est toujours nul, donc illimité) et le contresens invisible.
        //
        // Ouvert au manager, il produirait des tâches ZOMBIES : `completeOneToOne` re-teste le
        // périmètre du titulaire (complete-one-to-one.ts:75) et `toggleTask` refuse la coche sèche
        // d'un 1:1 (plus bas) — une tâche déposée hors du périmètre du titulaire ne peut donc
        // JAMAIS être fermée, ni cochée, ni débriefée. On teste donc les deux : le titulaire
        // parce qu'il doit pouvoir clore, le déposant parce qu'on ne vise pas un chatteur qu'on
        // n'a pas soi-même le droit de suivre.
        await assertChatterInScope(
          caller.id,
          caller.baseRole,
          d.chatterId,
          "Ce chatter n'est pas dans ton périmètre.",
        )
        if (caller.id !== d.ownerId) {
          await assertChatterInScope(
            d.ownerId,
            await baseRoleOf(d.ownerId),
            d.chatterId,
            "Ce chatter n'est pas dans le périmètre de la personne visée : elle ne pourrait pas clore le 1:1.",
          )
        }
      }
      const admin = createAdminClient()
      const { error } = await admin.from('tracker_todo_tasks').insert({
        owner_id: d.ownerId,
        date: d.date,
        category: d.category,
        label: d.label,
        chatter_id: d.chatterId,
        // Trace de la hiérarchie : `null` quand on écrit chez soi, pour ne pas marquer d'un
        // « déposée par » toutes les tâches qu'on se donne soi-même.
        created_by: caller.id === d.ownerId ? null : caller.id,
      })
      if (error) throw new Error(error.message)
      revalidateTodo()
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
      // exige le compte-rendu et crée la session.
      //
      // DÉCOCHER non plus, dès lors qu'un bilan existe — et c'est la moitié qui manquait. Leur
      // `toggle()` décochait sans condition (todo.html:1447-1456), mais leur écran ne mémorisait
      // pas la session ; ici `session_id` (0133) reste posé au décochage, et `completeOneToOne` ne
      // refuse que sur `done` : décocher puis reclôturer créait donc une SECONDE session dans la
      // fiche du chatteur — 1:1 en double dans l'historique, moyenne et compteur faussés.
      //
      // On renvoie vers la suppression du bilan plutôt que de le détruire ici en silence : « un 1:1
      // réalisé laisse toujours une trace » (routes.js.txt:328-329). Supprimer le bilan sur la
      // fiche rouvre la tâche (`deleteSession`, tracking-coaching), et la boucle est refermée.
      const { data: t, error: tErr } = await admin
        .from('tracker_todo_tasks').select('chatter_id, session_id').eq('id', id).maybeSingle()
      if (tErr) throw new Error(tErr.message)
      if (d.done && t?.chatter_id) {
        throw new BusinessError('Cette tâche 1:1 se termine par son bilan, sur la fiche du chatter.')
      }
      if (!d.done && t?.session_id) {
        throw new BusinessError(
          'Ce 1:1 a un bilan : supprime-le sur la fiche du chatter, la tâche redeviendra à faire.',
        )
      }
      const { error } = await admin
        .from('tracker_todo_tasks')
        .update({ done: d.done, done_at: d.done ? new Date().toISOString() : null })
        .eq('id', id)
        .eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidateTodo()
    },
  })
}

export async function deleteTask(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      // Contrôle de FORME avant la garde, et c'est délibéré : une occurrence virtuelle n'existe
      // pas en base (`deleteTaskOccurrence`, « Juste aujourd'hui », la matérialise avant de la
      // retirer), or `assertCanUnassign` a besoin d'une vraie ligne pour lire son `created_by`.
      // Aucune information ne fuit : ce test ne regarde que la forme de l'id fourni.
      if (parseVirtual(d.taskId)) throw new BusinessError("Utilise « Juste aujourd'hui » pour cette occurrence.")
      // 2e dérogation du legacy : « retirer ce qu'il a déposé (ou corriger une erreur) » —
      // `task-delete` est la SEULE suppression possible chez autrui (routes.js.txt:306-315, qui
      // refait le contrôle à la main au lieu d'utiliser `ownTask`).
      await assertCanUnassign(d.ownerId, d.taskId)
      const admin = createAdminClient()
      // Une tâche 1:1 CLÔTURÉE ne se supprime pas : sa session resterait dans la fiche du chatteur
      // sans plus rien pour la rattacher, et `deleteSession` n'aurait plus de tâche à rouvrir.
      // C'est le second chemin de la même règle que `toggleTask` — la croix est juste à côté de la
      // case, et sans ce test elle contournait le refus du décochage d'un seul clic.
      const { data: existing, error: exErr } = await admin
        .from('tracker_todo_tasks').select('session_id').eq('id', d.taskId).eq('owner_id', d.ownerId).maybeSingle()
      if (exErr) throw new Error(exErr.message)
      if (existing?.session_id) {
        throw new BusinessError(
          'Ce 1:1 a un bilan : supprime-le sur la fiche du chatter, la tâche redeviendra à faire.',
        )
      }
      const { error } = await admin
        .from('tracker_todo_tasks').delete().eq('id', d.taskId).eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
    },
  })
}
