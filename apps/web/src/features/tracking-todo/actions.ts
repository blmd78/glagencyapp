'use server'

import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { assertOwner, assertCanOrganize, revalidateTodo } from './actions-shared'
import { addTaskInput, deleteTaskInput, moveTaskInput, toggleTaskInput, updateTaskInput } from './schema'
import { materialize, parseVirtual } from './materialize'
import { placeTask } from './section-slots'

/**
 * Mutations de la to-do hebdomadaire.
 *
 * ÉCRITURES EN SERVICE-ROLE APRÈS GARDE, comme toute la face Formation : la migration 0127 ne pose
 * aucune politique d'écriture, donc il n'existe qu'UN chemin d'écriture, celui qui passe par ici.
 *
 * DEUX FAMILLES DE GESTES, deux gardes — la frontière est ORGANISER / ATTESTER (décision de
 * Benoit du 2026-09-07, raisonnement complet dans `lib/tracking/todo-guards.ts`) :
 *
 * • `assertCanOrganize` — le contenu du planning : déposer, modifier (#160), déplacer, supprimer,
 *   les sections, les habitudes, le jour de repos. Le titulaire, son encadrement (manager du
 *   titulaire), l'admin.
 * • `assertOwner` — l'attestation : la coche, le débrief, les notes, les liens. Le titulaire seul,
 *   admin compris.
 *
 * Les sections et les habitudes vivent dans `actions-structure.ts` (même partage, plus
 * `assertCanEditHabit` : une habitude déposée est verrouillée pour son titulaire).
 *
 * La vérification est faite UNE fois, dans le handler — jamais en double dans `guard`, ce que la
 * checklist des guidelines interdit explicitement.
 */

// ============================================================ tâches

export async function addTask(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: addTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      const caller = await assertCanOrganize(d.ownerId)
      // AUCUN PÉRIMÈTRE MODÈLES sur la cible d'un 1:1 depuis le 2026-09-05. Deux tests vivaient ici
      // — celui du déposant et celui du TITULAIRE — et ils n'avaient qu'une raison d'être : éviter
      // des tâches ZOMBIES, puisque `completeOneToOne` re-testait alors le périmètre du titulaire.
      // Ce test-là a sauté avec le décloisonnement du suivi (décision de Benoit ; raisonnement dans
      // `features/tracking-coaching/services/get-coaching-list.ts`) : n'importe quel encadrant peut
      // désormais clore n'importe quel 1:1, donc plus aucune tâche déposée ne peut être zombie, et
      // il ne reste rien à vérifier. `assertCanOrganize` continue de dire QUI peut déposer chez QUI.
      const admin = createAdminClient()
      const { data: created, error } = await admin
        .from('tracker_todo_tasks')
        .insert({
          owner_id: d.ownerId,
          date: d.date,
          category: d.category,
          label: d.label,
          description: d.description,
          urgency: d.urgency,
          chatter_id: d.chatterId,
          // Trace de la hiérarchie : `null` quand on écrit chez soi, pour ne pas marquer d'un
          // « déposée par » toutes les tâches qu'on se donne soi-même.
          created_by: caller.id === d.ownerId ? null : caller.id,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      // #161 — l'urgence décide de la place d'arrivée : urgente en haut, importante sous les
      // urgentes, normale en bas.
      await placeTask(d.ownerId, created.id, d.date, d.category, { urgency: d.urgency })
      revalidateTodo()
    },
  })
}

/**
 * La pop-up d'une tâche (#160) : titre, description, urgence et jour.
 *
 * ORGANISER, comme déplacer ou supprimer : c'est le contenu du planning, pas une attestation —
 * l'encadrement modifie ce qu'il a déposé comme ce que le titulaire s'est donné. Changer le jour,
 * c'est le geste de `moveTask` : la section reste la même.
 *
 * Sur une occurrence d'habitude, seule l'occurrence change (décision de Benoit, 2026-10-12) :
 * on la matérialise, puis on modifie la ligne — le gabarit, lui, ne bouge pas. C'est `habit_id`
 * (0193) qui empêche l'habitude de renaître à côté d'une occurrence renommée.
 */
export async function updateTask(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateTaskInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertCanOrganize(d.ownerId)
      const id = await materialize(d.ownerId, d.taskId)
      const admin = createAdminClient()
      const { data: before, error: readErr } = await admin
        .from('tracker_todo_tasks')
        .select('date, category, label, urgency, habit_id')
        .eq('id', id)
        .eq('owner_id', d.ownerId)
        .maybeSingle()
      if (readErr) throw new Error(readErr.message)
      if (!before) throw new BusinessError('Cette tâche a été supprimée entre-temps.')
      // Une occurrence matérialisée AVANT 0193 n'a pas de `habit_id` : seuls son intitulé et son jour
      // la reconnaissent. La renommer ou la déplacer ferait renaître son habitude à côté, et le Récap
      // la compterait due une seconde fois. On la rattache donc à l'habitude qu'elle est — même règle
      // que `isMaterialized` — avant d'y toucher.
      let link: { habit_id: string; habit_date: string } | null = null
      if (before.habit_id === null && (before.label !== d.label || before.date !== d.date)) {
        const { data: habit, error: hErr } = await admin
          .from('tracker_todo_habits')
          .select('id')
          .eq('owner_id', d.ownerId)
          .eq('category', before.category)
          .eq('label', before.label)
          .limit(1)
          .maybeSingle()
        if (hErr) throw new Error(hErr.message)
        if (habit) link = { habit_id: habit.id, habit_date: before.date }
      }
      const { error } = await admin
        .from('tracker_todo_tasks')
        .update({ label: d.label, description: d.description, urgency: d.urgency, date: d.date, ...link })
        .eq('id', id)
        .eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      // #161 — l'urgence redécide de la place quand elle change, ou quand la tâche ARRIVE sur un
      // autre jour. Un simple changement de titre ne la déplace pas.
      if (before.date !== d.date || before.urgency !== d.urgency) {
        await placeTask(d.ownerId, id, d.date, before.category, { urgency: d.urgency })
      }
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
      // Une occurrence virtuelle n'existe pas en base : elle se retire par « Juste aujourd'hui »
      // (`deleteTaskOccurrence`, qui la matérialise d'abord). Aucune information ne fuit — ce test
      // ne regarde que la forme de l'id fourni.
      if (parseVirtual(d.taskId)) throw new BusinessError("Utilise « Juste aujourd'hui » pour cette occurrence.")
      // N'IMPORTE QUELLE tâche de la semaine, et plus seulement celles qu'on y avait déposées : le
      // legacy limitait le retrait à `created_by = moi`, ce qui interdisait à un manager d'enlever
      // une tâche que son sous-manager s'était donnée — donc de réorganiser sa semaine. Ouvert le
      // 2026-09-07 avec le reste de l'organisation.
      await assertCanOrganize(d.ownerId)
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
      // Déplacer = organiser : c'est le geste même de « gérer leur emploi du temps ».
      await assertCanOrganize(d.ownerId)
      const id = await materialize(d.ownerId, d.taskId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_tasks')
        .update({ date: d.date, category: d.category })
        .eq('id', id)
        .eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      // #161 — à l'endroit où on l'a lâchée (au-dessus de `beforeId`), en bas sinon. Un geste
      // manuel : l'urgence n'y change rien.
      await placeTask(d.ownerId, id, d.date, d.category, { beforeId: d.beforeId })
      revalidateTodo()
    },
  })
}

// ============================================================ occurrences d'habitude

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
      // Le titulaire garde ce geste sur une habitude DÉPOSÉE (c'est sa seule issue, cf.
      // `canEditHabit`) ; son encadrement l'a au même titre que le reste de l'organisation.
      await assertCanOrganize(d.ownerId)
      const id = await materialize(d.ownerId, d.taskId)
      const { error } = await createAdminClient()
        .from('tracker_todo_tasks').delete().eq('id', id).eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidateTodo()
    },
  })
}
