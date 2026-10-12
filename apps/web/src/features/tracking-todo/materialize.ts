import 'server-only'
import { createAdminClient } from '@glagency/db'
import { BusinessError } from '@/lib/actions'
import { habitKey } from './order'

/*
 * L'occurrence d'une habitude n'existe en base qu'au premier geste (cocher, déplacer, modifier) :
 * ici. Sorti de `actions.ts` (limite de 300 lignes, revue du #163) sans changer de règle ; n'est
 * appelé que par des actions qui ont déjà passé leur garde.
 */

/** Une occurrence virtuelle d'habitude : `habit:<uuid>:<date>`. */
export function parseVirtual(taskId: string): { habitId: string; date: string } | null {
  const m = /^habit:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(taskId)
  return m ? { habitId: m[1] as string, date: m[2] as string } : null
}

/**
 * Transforme une occurrence virtuelle en vraie ligne, et rend son id.
 * C'est LE moment où une habitude existe en base : au premier geste, jamais à l'affichage.
 */
export async function materialize(ownerId: string, taskId: string): Promise<string> {
  const virt = parseVirtual(taskId)
  if (!virt) return taskId

  const admin = createAdminClient()
  const { data: habit, error } = await admin
    .from('tracker_todo_habits')
    .select('category, label, description, urgency, position, created_by')
    .eq('id', virt.habitId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!habit) throw new BusinessError('Cette habitude a été supprimée entre-temps.')

  const { data: created, error: insErr } = await admin
    .from('tracker_todo_tasks')
    .insert({
      owner_id: ownerId,
      date: virt.date,
      category: habit.category,
      label: habit.label,
      description: habit.description,
      urgency: habit.urgency,
      // Le lien vers le gabarit ET le jour (0193) : ce sont eux, et non plus l'intitulé et la date,
      // qui disent que l'occurrence de ce jour existe déjà (`isMaterialized`). Une occurrence
      // renommée ou changée de jour dans la pop-up reste donc la sienne, au lieu de laisser
      // l'habitude renaître à côté.
      habit_id: virt.habitId,
      habit_date: virt.date,
      // Sa place : celle de l'occurrence virtuelle qu'elle remplace, en haut de la section (#161,
      // `habitKey`). Cocher une habitude ne la fait pas sauter de rang.
      position: habitKey(habit.position),
      // La tâche HÉRITE du déposant du gabarit. Sans ça, l'occurrence d'une habitude déposée par
      // la hiérarchie naît avec `created_by: null`, c'est-à-dire « posée par le titulaire » : elle
      // perd son badge « déposée » au premier geste. Le gabarit dit qui l'a voulue ; la tâche aussi.
      created_by: habit.created_by,
    })
    .select('id')
    .single()
  if (insErr) throw new Error(insErr.message)
  return created.id
}
