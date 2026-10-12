import { addDays, isoWeekday, serviceDayParis, todayParis } from '@glagency/core'
import { createClient } from '@/lib/supabase/server'
import { canEditHabit } from '@/lib/tracking/habit-rules'
import { TODO_ROLES } from '@/lib/tracking/todo-roles'
import { defaultDebriefDay } from '../debrief-day'
import { dueHabits, isDue, isSectionOn } from '../occurrence'
import { habitKey, sortSlots } from '../order'
import type { TodoDaily, TodoDay, TodoLink, TodoSection, TodoTask, TodoWeek } from '../types'
import { asUrgency } from '../urgency'
import { getTodoChatters } from './get-todo-chatters'

/** Lundi de la semaine contenant `day`. */
export const weekStartOf = (day: string): string => addDays(day, -(isoWeekday(day) - 1))

/** `YYYY-MM-DD` parsable — le seul format qu'acceptent les helpers de dates de core. */
const isDay = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

/**
 * Les rôles qui ÉCRIVENT sur une to-do — `TODO_ROLES`, la même liste que la garde serveur
 * (`requireTodoAccess` → `canWriteTodo`). `police` y est entré le 2026-09-08 avec le reste de la
 * feature ; il n'y était pas tant que la garde dérivait de `hasWriteAccess` (lib/auth).
 *
 * Le droit `presence`, lui, n'est pas retesté ici : la page l'a exigé (`requireAccess`).
 */
const ENCADRANT_ROLES: readonly string[] = TODO_ROLES

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
  // `?week=` arrive brut de l'URL : une valeur bricolée retombe en silence sur la semaine courante
  // (même principe que `?owner=` refusé) au lieu de faire lever `toISOString` sur une date invalide.
  const weekParam = params.week && isDay(params.week) ? params.week : today
  const weekStart = weekStartOf(weekParam)
  const weekEnd = addDays(weekStart, 6)
  const supabase = await createClient()

  const [sectionsRes, tasksRes, habitsRes, dayoffRes, notesRes, linksRes, dailyRes] =
    await Promise.all([
      supabase.from('tracker_todo_sections').select('name, weekdays, starts_on, position')
        .eq('owner_id', params.ownerId).order('position'),
      // Les tâches de la semaine, plus les occurrences d'habitude de la semaine DÉPLACÉES ailleurs
      // (`habit_date`, 0193) : elles ne s'affichent pas ici, mais disent que leur habitude est
      // déjà matérialisée ce jour-là (`isMaterialized`).
      supabase.from('tracker_todo_tasks')
        .select('id, date, category, label, description, urgency, habit_id, habit_date, skipped, done, position, created_at, created_by, chatter_id, session_id, chatter:profiles!tracker_todo_tasks_chatter_id_fkey(display_name)')
        .eq('owner_id', params.ownerId)
        .or(`and(date.gte.${weekStart},date.lte.${weekEnd}),and(habit_date.gte.${weekStart},habit_date.lte.${weekEnd})`)
        .order('position'),
      // TOUTES les habitudes, actives ou non : le panneau de gestion doit montrer celles en pause
      // (leur liste les grise au lieu de les cacher, `.grow.off`). Le filtre `active` se fait plus
      // bas, au moment de projeter les occurrences dans la semaine.
      // La `position` d'une habitude fixe la place de son occurrence en haut de la section (#161,
      // `habitKey`) ; `created_at` ne départage que les lignes d'avant 0193.
      supabase.from('tracker_todo_habits').select('id, category, label, description, urgency, weekdays, active, starts_on, position, created_by')
        .eq('owner_id', params.ownerId).order('position').order('created_at'),
      supabase.from('tracker_todo_dayoff').select('date')
        .eq('owner_id', params.ownerId).gte('date', weekStart).lte('date', weekEnd),
      supabase.from('tracker_todo_notes').select('body')
        .eq('owner_id', params.ownerId).eq('week', weekStart).maybeSingle(),
      supabase.from('tracker_todo_links').select('id, label, url')
        .eq('owner_id', params.ownerId).order('position'),
      // Les SEPT débriefs possibles de la semaine, pas seulement celui du jour civil : la carte
      // laisse choisir le jour (celui qui finit à 3 h débriefe la veille), et bascule sans requête.
      supabase.from('tracker_todo_daily').select('date, focus, problem, positive, negative, notes')
        .eq('owner_id', params.ownerId).gte('date', weekStart).lte('date', weekEnd),
    ])

  for (const res of [sectionsRes, tasksRes, habitsRes, dayoffRes, notesRes, linksRes, dailyRes]) {
    if (res.error) throw new Error(res.error.message)
  }

  const sections = sectionsRes.data ?? []
  const tasks = tasksRes.data ?? []
  const habits = habitsRes.data ?? []
  const offDays = new Set((dayoffRes.data ?? []).map((d) => d.date))
  const occurrences = tasks.map((t) => ({
    habitId: t.habit_id,
    habitDate: t.habit_date,
    date: t.date,
    label: t.label,
    category: t.category,
  }))

  const days: TodoDay[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const wd = isoWeekday(date)
    // Une occurrence SAUTÉE (« Juste aujourd'hui », 0195) ne s'affiche pas — mais reste dans
    // `occurrences` : c'est elle qui empêche l'habitude de renaître ce jour-là.
    const dayTasks = tasks.filter((t) => t.date === date && !t.skipped)

    // Les catégories du jour : les sections récurrentes de ce jour de semaine, plus toute
    // catégorie qui porte déjà une tâche — une section supprimée ne doit jamais faire disparaître
    // des tâches de l'écran (c'est ce que leur bouton promet explicitement).
    const names = new Set<string>()
    for (const s of sections) if (isSectionOn(s, date)) names.add(s.name)
    for (const t of dayTasks) names.add(t.category)
    for (const h of habits) if (isDue(h, date)) names.add(h.category)

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
        // ORDRE (#161) : chaque tâche porte sa clé (`order.ts`) — la `position` d'une vraie ligne,
        // départagée par sa création ; le rang de son habitude pour une occurrence virtuelle, qui
        // passe ainsi en haut. On trie le tout, et non plus « les vraies, puis les habitudes ».
        const real = dayTasks
          .filter((t) => t.category === name)
          .map((t) => ({
            key: t.position,
            tie: t.created_at,
            task: {
              id: t.id,
              label: t.label,
              description: t.description,
              urgency: asUrgency(t.urgency),
              done: t.done,
              virtual: false,
              fromOther: t.created_by != null && t.created_by !== params.ownerId,
              depositedByMe: t.created_by != null && t.created_by === params.callerId,
              chatterId: t.chatter_id,
              hasBilan: t.session_id != null,
              chatterName: t.chatter?.display_name ?? null,
            } satisfies TodoTask,
          }))
        // Une habitude ne s'affiche que si son occurrence du jour n'a pas déjà été matérialisée.
        const virtual = dueHabits(habits, date, name, occurrences)
          .map((h) => ({
            key: habitKey(h.position),
            tie: '',
            task: {
              id: `habit:${h.id}:${date}`,
              label: h.label,
              description: h.description,
              urgency: asUrgency(h.urgency),
              done: false,
              virtual: true,
              // L'occurrence porte le badge « déposée » dès le gabarit, avant même d'exister en
              // base : sinon la même tâche l'aurait au premier geste (`materialize` recopie
              // `created_by`) et pas avant — un badge qui apparaît en cochant.
              fromOther: h.created_by != null && h.created_by !== params.ownerId,
              // `false` MÊME pour son déposant, et c'est délibéré : ce drapeau n'ouvre que la croix
              // de suppression sur la semaine d'un autre (`task-item.tsx`), or supprimer une
              // occurrence virtuelle passe par `deleteTaskOccurrence`, réservé au titulaire. Le
              // gabarit se retire depuis le panneau Habitudes, qui est l'endroit prévu pour ça.
              depositedByMe: false,
              // Une habitude ne vise jamais un chatteur : un 1:1 se pose au cas par cas.
              chatterId: null,
              hasBilan: false,
              chatterName: null,
            } satisfies TodoTask,
          }))
        return {
          name,
          recurring: sections.some((s) => s.name === name && isSectionOn(s, date)),
          tasks: sortSlots([...real, ...virtual]).map((x) => x.task),
        }
      }),
    })
  }

  const dailyByDay: Record<string, TodoDaily> = {}
  for (const { date, ...daily } of dailyRes.data ?? []) dailyByDay[date] = daily

  const isEncadrant = ENCADRANT_ROLES.includes(params.callerRole)
  // Sortis de l'objet de retour parce que les habitudes en dépendent (`canEdit`) : deux copies de
  // ces deux lignes, c'est deux occasions de les faire diverger. Leur commentaire est plus bas,
  // sur les champs qu'elles alimentent.
  const canWrite = params.callerId === params.ownerId && isEncadrant
  const canAssignHere = params.canAssign && params.callerId !== params.ownerId
  /**
   * ORGANISER : le contenu du planning (déposer, déplacer, supprimer, sections, habitudes, jour de
   * repos). Miroir exact de `assertCanOrganize` — titulaire OU encadrement — là où `canWrite`
   * garde le sens plus étroit d'ATTESTER (cocher, débriefer), qui ne se délègue pas.
   */
  const canOrganize = canWrite || canAssignHere
  // Les chatteurs proposables dans « Session 1:1 avec » — encadrants seulement (`getTodoChatters`).
  const chatters = isEncadrant
    ? await getTodoChatters({ callerId: params.callerId, callerRole: params.callerRole, ownerId: params.ownerId })
    : []

  return {
    ownerId: params.ownerId,
    weekStart,
    days,
    habits: habits.map((h) => ({
      id: h.id,
      label: h.label,
      description: h.description,
      urgency: asUrgency(h.urgency),
      category: h.category,
      weekdays: h.weekdays.split(',').map(Number),
      active: h.active,
      fromOther: h.created_by != null && h.created_by !== params.ownerId,
      // `canOrganize` en garde d'entrée : `canEditHabit` ne tranche que la PROPRIÉTÉ du gabarit,
      // pas le droit d'écrire sur cet écran (un chatteur à qui on a coché « Présence » est
      // titulaire de ses habitudes sans pouvoir toucher à quoi que ce soit). Les deux questions de
      // la garde serveur, dans le même ordre.
      canEdit:
        canOrganize &&
        canEditHabit({
          callerId: params.callerId,
          callerRole: params.callerRole,
          ownerId: params.ownerId,
          createdBy: h.created_by,
          canOrganize: canAssignHere,
        }),
    })),
    chatters,
    notes: notesRes.data?.body ?? '',
    links: (linksRes.data ?? []) as TodoLink[],
    dailyByDay,
    today,
    // JOUR PROPOSÉ POUR LE BILAN = la journée de SERVICE, pas le jour civil. Entre minuit et 5 h,
    // l'encadrant qui débriefe termine la journée d'hier (`serviceDayParis`) ; lui proposer la
    // date du calendrier, c'était compter son bilan sur le lendemain — signalé le 2026-09-08, et
    // visible en base : deux débriefs sur huit écrits après minuit portaient la mauvaise date,
    // les six autres avaient été recalés à la main dans le sélecteur.
    //
    // `today` juste au-dessus reste le jour CIVIL, à dessein : c'est lui qui surligne la colonne
    // du jour dans la grille et qui grise les jours à venir dans le sélecteur. La veille doit y
    // rester sélectionnable — elle est passée.
    debriefDay: defaultDebriefDay(serviceDayParis(), weekStart),
    // Sur la semaine d'un AUTRE, on organise mais on n'atteste pas : `canOrganize` ouvre le
    // planning à l'encadrement (2026-09-07), `canWrite` reste la coche et le débrief, que personne
    // ne signe à la place du titulaire — admin compris (cf. `assertOwner`).
    // `isEncadrant` en plus du titulaire : la garde d'écriture est `requireTodoAccess`
    // (un rôle qui a une to-do, porteur du droit), pas le simple port du droit. Un chatteur à qui
    // on a coché « Présence » voyait sinon un écran entièrement éditable dont chaque geste part en
    // « Accès refusé » — l'UI est optimiste, elle n'a pas le droit d'être plus permissive que le
    // serveur.
    canWrite,
    canAssign: canAssignHere,
    canOrganize,
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
