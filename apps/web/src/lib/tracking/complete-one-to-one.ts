'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { getProfile } from '@/lib/auth'
import { getCreatorScope, isChatterInScope } from '@/lib/services/creator-scope'
import { z } from 'zod'
import { assertOwner, TODO_PATH } from './todo-guards'

/**
 * Clôture d'une tâche 1:1 : le bilan et la coche partent ENSEMBLE. Pas de compte-rendu, pas de
 * coche — c'est la règle qui fait qu'un 1:1 réalisé laisse toujours une trace dans la fiche du
 * chatteur (routes.js.txt:328-329).
 *
 * Déclaré ICI et non dans `features/tracking-todo/schema.ts` : ce module vit en `lib/` pour être
 * appelable des deux features, et `lib/` n'importe pas `features/` (frontière ESLint).
 */
const completeOneToOneInput = z.object({
  ownerId: z.uuid(),
  taskId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  score: z.number().min(0).max(20).nullable().default(null),
  summary: z.string().trim().min(1, 'Le compte-rendu est obligatoire.').max(8000),
  general: z.string().max(8000).default(''),
  ratings: z
    .array(z.object({
      skillId: z.uuid(),
      stars: z.number().int().min(1).max(5),
      comment: z.string().max(2000).default(''),
    }))
    .max(50)
    .default([]),
})

/** Le chatteur visé est-il dans le périmètre modèles de l'appelant ? (message du legacy) */
async function assertChatterInScope(callerId: string, chatterId: string): Promise<void> {
  const profile = await getProfile()
  const scope = await getCreatorScope(callerId, profile?.baseRole ?? 'chatteur')
  if (!(await isChatterInScope(scope, chatterId))) {
    throw new BusinessError("Ce chatter n'est plus dans ton périmètre.")
  }
}

/**
 * Clôt une tâche « 1:1 » : crée la session dans la fiche du chatteur, y attache les notes de
 * compétences, puis marque la tâche faite EN MÉMORISANT l'id de la session.
 *
 * « Tâche 1:1 : pas de compte-rendu, pas de coche. C'est la règle qui fait qu'un 1:1 réalisé laisse
 * toujours une trace dans la fiche du chatter » (routes.js.txt:328-329). Le compte-rendu est donc
 * exigé par le schéma, pas seulement par le formulaire : un appel forgé ne peut pas cocher à vide.
 *
 * Le périmètre est RE-testé ici, et pas seulement à la pose : entre les deux, les modèles ont pu
 * être réassignées — d'où le message au présent du legacy (routes.js.txt:331).
 */
export async function completeOneToOne(raw: unknown): Promise<ActionResult<{ sessionId: string }>> {
  return runAction({
    schema: completeOneToOneInput,
    input: raw,
    guard: noGuard,
    handler: async (d): Promise<{ sessionId: string }> => {
      const callerId = await assertOwner(d.ownerId)
      const admin = createAdminClient()

      const { data: task, error: tErr } = await admin
        .from('tracker_todo_tasks')
        .select('id, chatter_id, done')
        .eq('id', d.taskId)
        .eq('owner_id', d.ownerId)
        .maybeSingle()
      if (tErr) throw new Error(tErr.message)
      if (!task) throw new BusinessError('Tâche introuvable.')
      if (!task.chatter_id) throw new BusinessError("Cette tâche n'est pas un 1:1.")
      if (task.done) throw new BusinessError('Ce 1:1 est déjà clôturé.')
      await assertChatterInScope(callerId, task.chatter_id)

      const { data: session, error: sErr } = await admin
        .from('tracker_sessions')
        .insert({
          chatter_id: task.chatter_id,
          author_id: callerId,
          date: d.date,
          score: d.score,
          summary: d.summary,
          general: d.general,
        })
        .select('id')
        .single()
      if (sErr) throw new Error(sErr.message)

      if (d.ratings.length > 0) {
        const { error: rErr } = await admin.from('tracker_ratings').insert(
          d.ratings.map((r) => ({
            chatter_id: task.chatter_id as string,
            skill_id: r.skillId,
            session_id: session.id,
            stars: r.stars,
            comment: r.comment,
            author_id: callerId,
          })),
        )
        if (rErr) throw new Error(rErr.message)
      }

      // La tâche mémorise SA session : c'est la preuve que le 1:1 a laissé une trace
      // (`todo.setDone(task.id, true, sessionId)`, routes.js.txt:340).
      const { error: dErr } = await admin
        .from('tracker_todo_tasks')
        .update({ done: true, done_at: new Date().toISOString(), session_id: session.id })
        .eq('id', task.id)
      if (dErr) throw new Error(dErr.message)

      revalidatePath(TODO_PATH)
      revalidatePath(`/chatter/presence/suivi/${task.chatter_id}`)
      return { sessionId: session.id }
    },
  })
}
