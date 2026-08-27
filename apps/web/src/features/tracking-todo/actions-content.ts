'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, type ActionResult } from '@/lib/actions'
import { todayParis } from '@glagency/core'
import { assertOwner, TODO_PATH } from './actions-shared'
import { addLinkInput, dailyInput, dayOffInput, deleteLinkInput, notesInput } from './schema'

/**
 * Mutations du CONTENU de la to-do : jour de repos, bloc-notes de la semaine, débrief du jour,
 * liens utiles. Séparées de `actions.ts` (tâches, sections, habitudes) qui dépassait les 300
 * lignes — même découpage que `training-catalog/actions.ts` / `actions-cases.ts`.
 *
 * Mêmes règles : écriture service-role après garde, propriété vérifiée dans le handler.
 */

export async function toggleDayOff(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: dayOffInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { data: existing, error } = await admin
        .from('tracker_todo_dayoff').select('date')
        .eq('owner_id', d.ownerId).eq('date', d.date).maybeSingle()
      if (error) throw new Error(error.message)
      const res = existing
        ? await admin.from('tracker_todo_dayoff').delete().eq('owner_id', d.ownerId).eq('date', d.date)
        : await admin.from('tracker_todo_dayoff').insert({ owner_id: d.ownerId, date: d.date })
      if (res.error) throw new Error(res.error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function saveNotes(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: notesInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { error } = await admin.from('tracker_todo_notes').upsert(
        { owner_id: d.ownerId, week: d.week, body: d.body, updated_at: new Date().toISOString() },
        { onConflict: 'owner_id,week' },
      )
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function saveDaily(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: dailyInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      // La DATE est calculée SERVEUR, comme le legacy (`todo.saveDaily(v.accountId, todo.today(), …)`,
      // routes.js.txt:425-429) : on ne débriefe que la journée en cours. L'accepter du client
      // permettait d'antidater, donc d'écraser le débrief d'un jour passé.
      const today = todayParis()
      const admin = createAdminClient()
      const { error } = await admin.from('tracker_todo_daily').upsert(
        {
          owner_id: d.ownerId,
          date: today,
          focus: d.focus,
          problem: d.problem,
          positive: d.positive,
          negative: d.negative,
          notes: d.notes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,date' },
      )
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
      revalidatePath('/chatter/presence/recap')
    },
  })
}

export async function addLink(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: addLinkInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      // Adresse saisie sans protocole (« mypuls.app ») : on la complète plutôt que de la refuser.
      const url = /^https?:\/\//i.test(d.url) ? d.url : `https://${d.url}`
      const { error } = await admin
        .from('tracker_todo_links').insert({ owner_id: d.ownerId, label: d.label, url })
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}

export async function deleteLink(raw: unknown): Promise<ActionResult> {
  return runAction({
    schema: deleteLinkInput,
    input: raw,
    guard: noGuard,
    handler: async (d) => {
      await assertOwner(d.ownerId)
      const admin = createAdminClient()
      const { error } = await admin
        .from('tracker_todo_links').delete().eq('id', d.linkId).eq('owner_id', d.ownerId)
      if (error) throw new Error(error.message)
      revalidatePath(TODO_PATH)
    },
  })
}
