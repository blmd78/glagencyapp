'use server'

import { createAdminClient } from '@glagency/db'
import { runAction, noGuard, type ActionResult } from '@/lib/actions'
import { assertOwner, revalidateTodo } from './actions-shared'
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
      revalidateTodo()
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
      revalidateTodo()
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
      // Le jour vient de la CARTE : l'encadrant le choisit parmi les sept de la semaine affichée.
      // Il était calculé serveur (`todayParis()`, jour civil) comme chez eux (routes.js.txt:425-427,
      // « toujours celui du jour ») — et c'est précisément ce qui était faux sur le terrain : les
      // services de l'encadrement finissent entre 2 h et 7 h, chaque débrief de fin de nuit partait
      // sur le lendemain (le pourquoi complet : en-tête de `debrief-day.ts`). Aucune borne : c'est
      // SON journal (`assertOwner`), il peut y revenir — décision Benoit du 2026-09-03.
      const admin = createAdminClient()
      const { error } = await admin.from('tracker_todo_daily').upsert(
        {
          owner_id: d.ownerId,
          date: d.date,
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
      revalidateTodo()
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
      revalidateTodo()
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
      revalidateTodo()
    },
  })
}
