import { addDays, isoWeekday, todayParis } from '@glagency/core'
import { createAdminClient } from '@glagency/db'
import { createClient } from '@/lib/supabase/server'
import { getCreatorScope } from '@/lib/services/creator-scope'
import type { TodoChatter, TodoDay, TodoLink, TodoSection, TodoTask, TodoWeek } from '../types'

/** Lundi de la semaine contenant `day`. */
export const weekStartOf = (day: string): string => addDays(day, -(isoWeekday(day) - 1))

/**
 * Les rôles qui ÉCRIVENT sur une to-do — miroir applicatif de `hasWriteAccess` (lib/auth), dont
 * dépend la garde serveur `requireWriteProfileLive('presence')`. `superadmin` en fait partie : il
 * hérite de tout (son absence de cette liste privait le propriétaire du sélecteur « 1:1 avec »).
 * `police` en est absent, comme dans `hasWriteAccess` — il lit la page, il n'y écrit pas.
 */
const ENCADRANT_ROLES = ['superadmin', 'admin', 'manager', 'sous-manager']

/**
 * Rôle EXACT du TITULAIRE de la semaine — `getCreatorScope` en a besoin pour savoir s'il faut
 * borner son périmètre (elle ne borne que manager/sous-manager/police). Client admin, comme la
 * liste des chatteurs juste en dessous : on lit ici le profil d'un AUTRE.
 */
async function ownerRole(ownerId: string): Promise<string> {
  const { data, error } = await createAdminClient()
    .from('profiles').select('role').eq('id', ownerId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.role ?? 'chatteur'
}

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
  /**
   * L'appelant a-t-il la dérogation de dépôt sur CETTE semaine ? Décidé par la page via
   * `canAssignTodoOf` (admin, ou manager du titulaire) — et non plus déduit d'un `isAdmin` ici :
   * la règle a désormais deux branches, elle ne doit vivre qu'à un seul endroit.
   */
  canAssign: boolean
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
        .select('id, date, category, label, done, position, created_by, chatter_id, session_id, chatter:profiles!tracker_todo_tasks_chatter_id_fkey(display_name)')
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
            depositedByMe: t.created_by != null && t.created_by === params.callerId,
            chatterId: t.chatter_id,
            hasBilan: t.session_id != null,
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
            depositedByMe: false,
            // Une habitude ne vise jamais un chatteur : un 1:1 se pose au cas par cas.
            chatterId: null,
            hasBilan: false,
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

  // Les chatteurs proposables dans « Session 1:1 avec » — bornés aux MÊMES périmètres que ceux que
  // `addTask` vérifiera. UNIQUEMENT pour les ENCADRANTS : un chatteur remplit sa propre to-do, il
  // ne planifie pas de 1:1 avec d'autres chatteurs — inutile de lui servir la liste.
  //
  // DEUX périmètres quand on garnit la semaine d'un AUTRE : le sien (on ne vise pas un chatteur
  // qu'on n'a pas le droit de suivre) ET celui du TITULAIRE (c'est lui qui devra clore le 1:1 —
  // une tâche déposée hors de son périmètre serait inclôturable). Sans cette intersection, le
  // sélecteur proposerait des noms que le serveur refuserait ensuite : une liste qui ment.
  const isEncadrant = ENCADRANT_ROLES.includes(params.callerRole)
  const chatters: TodoChatter[] = []
  if (isEncadrant) {
    const admin = createAdminClient()
    const scope = await getCreatorScope(params.callerId, params.callerRole)
    const ownerScope =
      params.callerId === params.ownerId ? scope : await getCreatorScope(params.ownerId, await ownerRole(params.ownerId))
    const { data: rows, error: cErr } = await admin
      .from('profiles')
      .select('id, display_name, profile_creators(creator_id)')
      .eq('role', 'chatteur')
      .is('left_at', null)
      .order('display_name')
    if (cErr) throw new Error(cErr.message)
    // `null` = pas de borne (admin, ou encadrant sans modèle assigné) — convention creator-scope.
    const inScope = (s: Set<string> | null, cs: { creator_id: string }[]) =>
      !s || cs.some((pc) => s.has(pc.creator_id))
    for (const r of rows ?? []) {
      const cs = r.profile_creators ?? []
      if (inScope(scope, cs) && inScope(ownerScope, cs)) {
        chatters.push({ id: r.id, name: r.display_name ?? '—' })
      }
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
    // `isEncadrant` en plus du titulaire : la garde d'écriture est `requireWriteProfileLive`
    // (admin, ou manager/sous-manager porteur du droit), pas le simple port du droit. Un chatteur
    // ou un policier à qui on a coché « Présence » voyait sinon un écran entièrement éditable dont
    // chaque geste part en « Accès refusé » — l'UI est optimiste, elle n'a pas le droit d'être
    // plus permissive que le serveur.
    canWrite: params.callerId === params.ownerId && isEncadrant,
    canAssign: params.canAssign && params.callerId !== params.ownerId,
    // Le journal personnel du titulaire (débrief + bloc-notes) est-il lisible ici ? La RLS le
    // réserve à son auteur et aux admins (0132 / 0137) : sur la semaine d'un autre, un MANAGER les
    // reçoit VIDES. Sans ce drapeau, l'écran afficherait « Mon débrief — à remplir » et un
    // bloc-notes blanc sur le travail de quelqu'un d'autre — faux, et exactement le mensonge
    // qu'on vient d'écarter du Récap. Le miroir est celui de la RLS, pas celui de `canWrite` :
    // un admin lit bien le journal d'autrui sans pouvoir y écrire.
    journalLisible:
      params.callerId === params.ownerId || ['admin', 'superadmin'].includes(params.callerRole),
  }
}
