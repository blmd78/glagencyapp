import 'server-only'
import { createAdminClient } from '@glagency/db'
import { BusinessError } from '@/lib/actions'
import { dueHabits, isShown } from './occurrence'
import { arrivalIndex, habitKey, placeAt, sortSlots, type Slot } from './order'
import { asUrgency, type Urgency } from './urgency'

/**
 * POSER UNE TÂCHE À SON RANG (#161) — le côté serveur de `order.ts`.
 *
 * Le serveur reconstruit la section telle que l'écran la montre (vraies lignes + occurrences
 * virtuelles dues), avec les MÊMES règles que `getTodoWeek` (`dueHabits`, `habitKey`, `sortSlots`) :
 * c'est la condition pour que « au-dessus de telle tâche » désigne la même place des deux côtés.
 *
 * Service-role, comme toutes les écritures `tracker_todo_*` (aucune policy d'écriture, 0127) :
 * n'est appelé que par des actions qui ont déjà passé `assertCanOrganize`.
 */

/** La section d'un jour, triée comme à l'écran, SANS la ligne `exclude` (celle qu'on pose). */
async function sectionSlots(ownerId: string, date: string, category: string, exclude: string): Promise<Slot[]> {
  const admin = createAdminClient()
  const [tasksRes, habitsRes] = await Promise.all([
    // Les lignes du jour, plus les occurrences de CE jour déplacées ailleurs (`habit_date`, 0193) —
    // le même périmètre que `getTodoWeek`.
    admin
      .from('tracker_todo_tasks')
      .select('id, date, category, label, habit_id, habit_date, skipped, position, created_at, urgency')
      .eq('owner_id', ownerId)
      .or(`date.eq.${date},habit_date.eq.${date}`),
    admin
      .from('tracker_todo_habits')
      .select('id, category, label, weekdays, active, starts_on, position, urgency')
      .eq('owner_id', ownerId),
  ])
  if (tasksRes.error) throw new Error(tasksRes.error.message)
  if (habitsRes.error) throw new Error(habitsRes.error.message)
  const rows = tasksRes.data ?? []
  // La ligne posée reste comptée pour dire que SON habitude est déjà matérialisée ce jour-là — sinon
  // l'occurrence virtuelle reparaîtrait dans la section, et la tâche se rangerait contre son fantôme.
  const occurrences = rows.map((t) => ({
    habitId: t.habit_id,
    habitDate: t.habit_date,
    date: t.date,
    label: t.label,
    category: t.category,
  }))
  const real: Slot[] = rows
    .filter((t) => t.date === date && t.category === category && t.id !== exclude && isShown(t))
    .map((t) => ({ id: t.id, key: t.position, tie: t.created_at, fixed: false, urgency: asUrgency(t.urgency) }))
  const virtual: Slot[] = dueHabits(habitsRes.data ?? [], date, category, occurrences).map((habit) => ({
    id: `habit:${habit.id}:${date}`,
    key: habitKey(habit.position),
    tie: '',
    fixed: true,
    urgency: asUrgency(habit.urgency),
  }))
  return sortSlots([...real, ...virtual])
}

/**
 * Range la ligne `rowId` dans sa section (`date`, `category`) :
 * • `{ beforeId }` — juste au-dessus de cette tâche (réelle ou virtuelle), en bas si `null` ou si
 *   elle n'y est plus : c'est le glisser-déposer ;
 * • `{ urgency }` — à la place d'arrivée de son urgence (`arrivalIndex`) : création, changement
 *   d'urgence ou de jour depuis la pop-up.
 */
export async function placeTask(
  ownerId: string,
  rowId: string,
  date: string,
  category: string,
  target: { beforeId: string | null } | { urgency: Urgency },
): Promise<void> {
  const slots = await sectionSlots(ownerId, date, category, rowId)
  let index = slots.length
  if ('urgency' in target) index = arrivalIndex(slots, target.urgency)
  else if (target.beforeId) {
    const at = slots.findIndex((s) => s.id === target.beforeId)
    if (at >= 0) index = at
  }
  const plan = placeAt(slots, index)
  if (!plan) throw new BusinessError('Cette section est trop chargée pour y placer une tâche à cet endroit.')

  const admin = createAdminClient()
  const results = await Promise.all([
    ...plan.moves.map((m) =>
      admin.from('tracker_todo_tasks').update({ position: m.key }).eq('id', m.id).eq('owner_id', ownerId),
    ),
    admin.from('tracker_todo_tasks').update({ position: plan.key }).eq('id', rowId).eq('owner_id', ownerId),
  ])
  for (const r of results) if (r.error) throw new Error(r.error.message)
}
