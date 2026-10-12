'use server'

import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { assertCanOrganize, assertCanEditHabit, revalidateTodo } from './actions-shared'
import {
  deleteHabitInput, deleteSectionInput, habitInput, renameSectionInput, sectionInput,
  setHabitActiveInput, updateHabitInput,
} from './schema'
import { mergeWeekdays } from './weekdays'

/**
 * La STRUCTURE de la semaine : sections et habitudes. Sortie de `actions.ts` (limite de 300 lignes,
 * revue du #163) sans changer de règle — même partage ORGANISER / ATTESTER, écritures en
 * service-role après garde (0127).
 *
 * • `assertCanOrganize` — créer, renommer, retirer une section ; poser une habitude.
 * • `assertCanEditHabit` — modifier, mettre en pause, supprimer une habitude : `assertCanOrganize`
 *   plus la question « à qui est ce gabarit ? » — une habitude déposée est verrouillée pour son
 *   titulaire.
 */

// ============================================================ sections

export async function saveSection(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: sectionInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      // Créer une section chez son sous-manager : sans ça, un manager pouvait déposer une tâche
      // mais pas créer l'endroit où la ranger — c'est ce qui bloquait Remi le 2026-09-07.
      await assertCanOrganize(d.ownerId)
      const admin = createAdminClient()
      // Les jours s'AJOUTENT à ceux que la section avait déjà. L'upsert écrasait la colonne :
      // retaper le nom d'une section existante depuis un autre jour la déplaçait au lieu de
      // l'étendre, et le jour d'origine perdait sa section en silence — sans aucun écran pour
      // le rattraper. Règle pure et testée dans `weekdays.ts`.
      const { data: existing, error: readErr } = await admin
        .from('tracker_todo_sections')
        .select('weekdays')
        .eq('owner_id', d.ownerId)
        .eq('name', d.name)
        .maybeSingle()
      if (readErr) throw new Error(readErr.message)
      const { error } = await admin
        .from('tracker_todo_sections')
        .upsert(
          {
            owner_id: d.ownerId,
            name: d.name,
            weekdays: mergeWeekdays(existing?.weekdays ?? '', d.weekdays),
          },
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
      await assertCanOrganize(d.ownerId)
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
      await assertCanOrganize(d.ownerId)
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
      // `assertCanOrganize` et non `assertOwner` : poser un rituel chez quelqu'un, c'est le même
      // périmètre que d'y déposer une tâche (admin, ou manager du titulaire) — rien de nouveau à
      // autoriser, juste la version récurrente d'un geste déjà permis.
      const caller = await assertCanOrganize(d.ownerId)
      const admin = createAdminClient()
      // En DERNIER parmi ses habitudes : la `position` fixe la place de ses occurrences en haut de
      // la section (#161, `habitKey`), et 0193 l'a rendue unique par titulaire.
      const { data: last, error: lastErr } = await admin
        .from('tracker_todo_habits')
        .select('position')
        .eq('owner_id', d.ownerId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastErr) throw new Error(lastErr.message)
      const { error } = await admin.from('tracker_todo_habits').insert({
        owner_id: d.ownerId,
        category: d.category,
        label: d.label,
        description: d.description,
        urgency: d.urgency,
        position: (last?.position ?? -1) + 1,
        weekdays: d.weekdays.join(','),
        // `null` quand on se la donne à soi-même — même convention que `addTask`, pour ne pas
        // marquer d'un « déposée » les habitudes qu'on s'impose.
        created_by: caller.id === d.ownerId ? null : caller.id,
      })
      // Une autre habitude créée au même instant a pris cette position (index unique, 0193).
      if (error?.code === '23505') {
        throw new BusinessError('Une autre habitude vient d’être créée en même temps : réessaie.')
      }
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
      await assertCanEditHabit(d.ownerId, d.habitId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_habits').delete().eq('id', d.habitId).eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidateTodo()
    },
  })
}


/**
 * Modifie une habitude — `prompt('Renommer l'habitude :')` chez eux, des champs chez nous ; depuis
 * le #160, l'intitulé, la description et l'urgence. Les occurrences DÉJÀ matérialisées gardent ce
 * qu'elles avaient (comme pour un renommage) : seules les suivantes reprennent le gabarit.
 */
export async function updateHabit(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: updateHabitInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertCanEditHabit(d.ownerId, d.habitId)
      const { error } = await createAdminClient()
        .from('tracker_todo_habits')
        .update({ label: d.label, description: d.description, urgency: d.urgency })
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
      await assertCanEditHabit(d.ownerId, d.habitId)
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
