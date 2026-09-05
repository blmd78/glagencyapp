'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@glagency/db'
import { BusinessError, runAction, noGuard, type ActionResult } from '@/lib/actions'
import { z } from 'zod'
import { assertOwner, revalidateTodo } from './todo-guards'

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

/**
 * Clôt une tâche « 1:1 » : crée la session dans la fiche du chatteur, y attache les notes de
 * compétences, puis marque la tâche faite EN MÉMORISANT l'id de la session.
 *
 * « Tâche 1:1 : pas de compte-rendu, pas de coche. C'est la règle qui fait qu'un 1:1 réalisé laisse
 * toujours une trace dans la fiche du chatter » (routes.js.txt:328-329). Le compte-rendu est donc
 * exigé par le schéma, pas seulement par le formulaire : un appel forgé ne peut pas cocher à vide.
 *
 * PLUS DE PÉRIMÈTRE MODÈLES depuis le 2026-09-05 (décision de Benoit ; raisonnement dans
 * `features/tracking-coaching/services/get-coaching-list.ts`). Il n'aurait pas pu rester : cette
 * ligne écrit une session DANS la fiche du chatteur, exactement ce que la fiche elle-même permet
 * désormais à tout porteur de la page. Le garder n'aurait interdit que le chemin To-Do, en
 * laissant l'autre ouvert — et c'est lui qui rendait certaines tâches inclôturables.
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
        .select('id, chatter_id, done, session_id')
        .eq('id', d.taskId)
        .eq('owner_id', d.ownerId)
        .maybeSingle()
      if (tErr) throw new Error(tErr.message)
      if (!task) throw new BusinessError('Tâche introuvable.')
      if (!task.chatter_id) throw new BusinessError("Cette tâche n'est pas un 1:1.")
      if (task.done) throw new BusinessError('Ce 1:1 est déjà clôturé.')
      // GARDE DE L'INVARIANT « une tâche 1:1 = au plus UNE session » — et c'est ICI qu'elle doit
      // vivre : c'est la seule ligne de code qui crée une session. Le test sur `done` seul ne suffit
      // pas, puisque `done` peut retomber à false (décochage, correctif d'un import, écriture SQL) ;
      // `session_id` ne retombe, lui, que par la suppression du bilan (FK on delete set null, 0133)
      // ou par la réouverture explicite de `deleteSession`. Sans cette ligne, tout chemin qui
      // décoche rouvre la porte à un deuxième 1:1 dans la fiche du chatteur pour un seul entretien.
      if (task.session_id) {
        throw new BusinessError('Ce 1:1 a déjà un bilan : supprime-le sur la fiche du chatter pour le refaire.')
      }

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

      revalidateTodo()
      revalidatePath(`/chatter/presence/suivi/${task.chatter_id}`)
      return { sessionId: session.id }
    },
  })
}
