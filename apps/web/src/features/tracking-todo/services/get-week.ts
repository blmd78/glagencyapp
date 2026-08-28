import { addDays, isoWeekday, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getCreatorScope } from '@/lib/services/creator-scope'
import type { TodoChatter, TodoDay, TodoLink, TodoSection, TodoTask, TodoWeek } from '../types'

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
  /** Rôle EXACT de l'appelant — c'est lui qui décide du périmètre modèles (jamais `role`). */
  callerRole: string
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
      supabase.from('tracker_todo_tasks')
        .select('id, date, category, label, done, position, created_by, chatter_id, chatter:profiles!tracker_todo_tasks_chatter_id_fkey(display_name)')
        .eq('owner_id', params.ownerId).gte('date', weekStart).lte('date', weekEnd).order('position'),
      // TOUTES les habitudes, actives ou non : le panneau de gestion doit montrer celles en pause
      // (leur liste les grise au lieu de les cacher, `.grow.off`). Le filtre `active` se fait plus
      // bas, au moment de projeter les occurrences dans la semaine.
      supabase.from('tracker_todo_habits').select('id, category, label, weekdays, active, position')
        .eq('owner_id', params.ownerId).order('position'),
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
    for (const h of habits) if (h.active && h.weekdays.split(',').map(Number).includes(wd)) names.add(h.category)

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
            chatterId: t.chatter_id,
            chatterName: t.chatter?.display_name ?? null,
          }))
        // Une habitude ne s'affiche que si son occurrence du jour n'a pas déjà été matérialisée.
        const virtual: TodoTask[] = habits
          .filter((h) => h.active)
          .filter((h) => h.category === name && h.weekdays.split(',').map(Number).includes(wd))
          .filter((h) => !real.some((r) => r.label === h.label))
          .map((h) => ({
            id: `habit:${h.id}:${date}`,
            label: h.label,
            done: false,
            virtual: true,
            fromOther: false,
            // Une habitude ne vise jamais un chatteur : un 1:1 se pose au cas par cas.
            chatterId: null,
            chatterName: null,
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

  // Les chatteurs proposables dans « Session 1:1 avec » — bornés au périmètre de l'APPELANT, comme
  // à la pose côté serveur : proposer un chatteur qu'on ne pourra pas noter n'a pas de sens.
  const scope = await getCreatorScope(params.callerId, params.callerRole)
  const chatters: TodoChatter[] = []
  {
    const admin = createAdminClient()
    const { data: rows, error: cErr } = await admin
      .from('profiles')
      .select('id, display_name, profile_creators(creator_id)')
      .eq('role', 'chatteur')
      .is('left_at', null)
      .order('display_name')
    if (cErr) throw new Error(cErr.message)
    for (const r of rows ?? []) {
      const ok = !scope || (r.profile_creators ?? []).some((pc) => scope.has(pc.creator_id))
      if (ok) chatters.push({ id: r.id, name: r.display_name ?? '—' })
    }
  }

  return {
    ownerId: params.ownerId,
    weekStart,
    days,
    habits: habits.map((h) => ({
      id: h.id,
      label: h.label,
      category: h.category,
      weekdays: h.weekdays.split(',').map(Number),
      active: h.active,
    })),
    chatters,
    notes: notesRes.data?.body ?? '',
    links: (linksRes.data ?? []) as TodoLink[],
    daily: dailyRes.data ?? { focus: '', problem: '', positive: '', negative: '', notes: '' },
    today,
    doneToday: allToday.filter((t) => t.done).map((t) => t.label),
    pendingToday: allToday.filter((t) => !t.done).map((t) => t.label),
    // La semaine d'un AUTRE est en lecture seule, même pour un admin — il ne coche pas, ne déplace
    // pas, ne signe pas le débrief d'autrui (règle du legacy, cf. `assertOwner`). Il garde le droit
    // d'y déposer et d'y retirer une tâche : ces deux gestes-là ont leur propre garde côté action.
    // Le legacy faisait pareil à l'écran : « la page ne rend alors aucun bouton » (routes.js.txt:252-256).
    canWrite: params.callerId === params.ownerId,
    canAssign: params.isAdmin && params.callerId !== params.ownerId,
  }
}
