import { addDays, isoWeekday, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import type { TodoDay, TodoLink, TodoSection, TodoTask, TodoWeek } from '../types'

/** Lundi de la semaine contenant `day`. */
export const weekStartOf = (day: string): string => addDays(day, -(isoWeekday(day) - 1))

/**
 * La semaine de to-do d'un encadrant.
 *
 * Six lectures parallèles, toutes bornées à la semaine ou au propriétaire : aucune n'approche les
 * 1000 lignes de la troncature PostgREST (une semaine de to-do, c'est quelques dizaines de lignes).
 * Pas de RPC ici, contrairement au board — il n'y a rien à agréger.
 */
export async function getTodoWeek(params: {
  ownerId: string
  callerId: string
  isAdmin: boolean
  week?: string
}): Promise<TodoWeek> {
  const today = todayParis()
  const weekStart = weekStartOf(params.week ?? today)
  const weekEnd = addDays(weekStart, 6)
  const supabase = await createClient()

  const [sectionsRes, tasksRes, habitsRes, dayoffRes, notesRes, linksRes, dailyRes] =
    await Promise.all([
      supabase.from('tracker_todo_sections').select('name, weekdays, position')
        .eq('owner_id', params.ownerId).order('position'),
      supabase.from('tracker_todo_tasks').select('id, date, category, label, done, position, created_by')
        .eq('owner_id', params.ownerId).gte('date', weekStart).lte('date', weekEnd).order('position'),
      supabase.from('tracker_todo_habits').select('id, category, label, weekdays, position')
        .eq('owner_id', params.ownerId).eq('active', true).order('position'),
      supabase.from('tracker_todo_dayoff').select('date')
        .eq('owner_id', params.ownerId).gte('date', weekStart).lte('date', weekEnd),
      supabase.from('tracker_todo_notes').select('body')
        .eq('owner_id', params.ownerId).eq('week', weekStart).maybeSingle(),
      supabase.from('tracker_todo_links').select('id, label, url')
        .eq('owner_id', params.ownerId).order('position'),
      supabase.from('tracker_todo_daily').select('focus, problem, positive, negative, notes')
        .eq('owner_id', params.ownerId).eq('date', today).maybeSingle(),
    ])

  for (const res of [sectionsRes, tasksRes, habitsRes, dayoffRes, notesRes, linksRes, dailyRes]) {
    if (res.error) throw new Error(res.error.message)
  }

  const sections = sectionsRes.data ?? []
  const tasks = tasksRes.data ?? []
  const habits = habitsRes.data ?? []
  const offDays = new Set((dayoffRes.data ?? []).map((d) => d.date))

  const days: TodoDay[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const wd = isoWeekday(date)
    const dayTasks = tasks.filter((t) => t.date === date)

    // Les catégories du jour : les sections récurrentes de ce jour de semaine, plus toute
    // catégorie qui porte déjà une tâche — une section supprimée ne doit jamais faire disparaître
    // des tâches de l'écran (c'est ce que leur bouton promet explicitement).
    const names = new Set<string>()
    for (const s of sections) if (s.weekdays.split(',').map(Number).includes(wd)) names.add(s.name)
    for (const t of dayTasks) names.add(t.category)
    for (const h of habits) if (h.weekdays.split(',').map(Number).includes(wd)) names.add(h.category)

    const ordered = [...names].sort((a, b) => {
      const pa = sections.find((s) => s.name === a)?.position ?? 999
      const pb = sections.find((s) => s.name === b)?.position ?? 999
      return pa - pb || a.localeCompare(b, 'fr')
    })

    days.push({
      date,
      weekdayLabel: new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' })
        .format(new Date(`${date}T12:00:00Z`)),
      dayLabel: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
        .format(new Date(`${date}T12:00:00Z`)),
      isToday: date === today,
      isWeekend: wd >= 6,
      dayOff: offDays.has(date),
      sections: ordered.map<TodoSection>((name) => {
        const real: TodoTask[] = dayTasks
          .filter((t) => t.category === name)
          .map((t) => ({
            id: t.id,
            label: t.label,
            done: t.done,
            virtual: false,
            fromOther: t.created_by != null && t.created_by !== params.ownerId,
          }))
        // Une habitude ne s'affiche que si son occurrence du jour n'a pas déjà été matérialisée.
        const virtual: TodoTask[] = habits
          .filter((h) => h.category === name && h.weekdays.split(',').map(Number).includes(wd))
          .filter((h) => !real.some((r) => r.label === h.label))
          .map((h) => ({
            id: `habit:${h.id}:${date}`,
            label: h.label,
            done: false,
            virtual: true,
            fromOther: false,
          }))
        return {
          name,
          recurring: sections.some((s) => s.name === name && s.weekdays.split(',').map(Number).includes(wd)),
          tasks: [...real, ...virtual],
        }
      }),
    })
  }

  const todayCol = days.find((d) => d.date === today)
  const allToday = todayCol?.sections.flatMap((s) => s.tasks) ?? []

  return {
    ownerId: params.ownerId,
    weekStart,
    days,
    notes: notesRes.data?.body ?? '',
    links: (linksRes.data ?? []) as TodoLink[],
    daily: dailyRes.data ?? { focus: '', problem: '', positive: '', negative: '', notes: '' },
    today,
    doneToday: allToday.filter((t) => t.done).map((t) => t.label),
    pendingToday: allToday.filter((t) => !t.done).map((t) => t.label),
    canWrite: params.isAdmin || params.callerId === params.ownerId,
  }
}
