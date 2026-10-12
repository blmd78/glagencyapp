'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { toast } from 'sonner'
import { addDays, isoWeekday } from '@glagency/core'
import { DayColumn } from './day-column'
import { DayDialog } from './day-dialog'
import type { NewTask } from './quick-add-task'
import { TaskDialog, type OpenTask } from './task-dialog'
import { TodoDnd } from './todo-dnd'
import { moveTaskInDays } from '../move-task'
import { addTask, deleteHabit, deleteSection, deleteTask, deleteTaskOccurrence, moveTask, saveSection, toggleTask } from '../actions'
import { toggleDayOff } from '../actions-content'
import type { TodoTask, TodoWeek } from '../types'

/**
 * La semaine : sept colonnes, glisser-déposer entre jours, sections et rangs (`TodoDnd`).
 *
 * Composant client assumé — contrairement au board, la donnée d'une semaine tient en quelques
 * dizaines de lignes, et tout ici est interactif (cocher, ajouter, déplacer). La sérialiser en
 * props coûte moins que d'inventer un aller-retour serveur par geste.
 *
 * `useOptimistic` : cocher une case — et lâcher une tâche sur un autre jour — doit répondre
 * instantanément. La Server Action revalide ensuite, et l'état optimiste est remplacé par la vérité
 * serveur — en cas d'échec, la case ou la tâche revient d'elle-même et un toast explique pourquoi.
 */
export function WeekGrid({ week }: { week: TodoWeek }) {
  const [, startTransition] = useTransition()
  const [days, applyOptimistic] = useOptimistic(
    week.days,
    (
      state,
      patch:
        | { kind: 'toggle'; taskId: string; done: boolean }
        | { kind: 'move'; taskId: string; date: string; category: string; beforeId: string | null },
    ) =>
      patch.kind === 'move'
        ? moveTaskInDays(state, patch.taskId, patch.date, patch.category, patch.beforeId)
        : state.map((d) => ({
            ...d,
            sections: d.sections.map((s) => ({
              ...s,
              tasks: s.tasks.map((t) => (t.id === patch.taskId ? { ...t, done: patch.done } : t)),
            })),
          })),
  )
  const [busy, setBusy] = useState(false)

  const router = useRouter()

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>): Promise<void> => {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (!res.success) toast.error(res.error ?? 'Erreur inattendue')
  }

  const onToggle = (task: TodoTask, done: boolean): void => {
    // COCHER un 1:1 n'est pas une case à cocher : on va rendre le bilan sur la fiche du chatteur,
    // et c'est son enregistrement qui clôt la tâche. « Pas de compte-rendu, pas de coche » — c'est
    // ce qui garantit qu'un 1:1 réalisé laisse toujours une trace. DÉCOCHER reste direct.
    if (done && task.chatterId) {
      // `week` fait l'aller-retour : la fiche nous ramènera sur la semaine d'où l'on est parti,
      // pas sur celle du jour civil — la nuit du dimanche au lundi, ce n'est plus la même.
      router.push(`/chatter/presence/suivi/${task.chatterId}?bilan=${task.id}&week=${week.weekStart}` as Route)
      return
    }
    startTransition(async () => {
      applyOptimistic({ kind: 'toggle', taskId: task.id, done })
      await run(() => toggleTask({ ownerId: week.ownerId, taskId: task.id, done }))
    })
  }

  /**
   * Supprimer une tâche issue d'une habitude est AMBIGU — leur commentaire le dit, et ils posent
   * la question au lieu de trancher : « La retirer seulement aujourd'hui, ou arrêter l'habitude
   * pour de bon ? » (todo.html:1459-1476). On refusait le geste avec « Retire l'habitude pour la
   * faire disparaître », ce qui laissait l'utilisateur sans issue depuis la tâche.
   */
  const [recurring, setRecurring] = useState<TodoTask | null>(null)

  const onDelete = (task: TodoTask): void => {
    if (task.virtual) {
      setRecurring(task)
      return
    }
    startTransition(() => run(() => deleteTask({ ownerId: week.ownerId, taskId: task.id })))
  }

  /** « Juste aujourd'hui » : on matérialise l'occurrence pour la supprimer, elle seule. */
  const onDeleteOnce = (task: TodoTask): void => {
    setRecurring(null)
    startTransition(() => run(() => deleteTaskOccurrence({ ownerId: week.ownerId, taskId: task.id })))
  }

  /**
   * Le gabarit derrière une occurrence récurrente — `habit:<id>:<date>`. Sert à savoir si son
   * arrêt est PROPOSABLE : une habitude déposée par la hiérarchie ne se supprime pas par son
   * titulaire (`canEditHabit`), et le serveur refuserait le geste.
   */
  const habitOf = (task: TodoTask | null) =>
    task?.virtual ? (week.habits.find((h) => h.id === task.id.split(':')[1]) ?? null) : null

  /** « Supprimer l'habitude » : le gabarit disparaît, ce qui est déjà coché reste dans l'historique. */
  const onDeleteHabit = (task: TodoTask): void => {
    const habitId = task.id.split(':')[1]
    setRecurring(null)
    if (habitId) startTransition(() => run(() => deleteHabit({ ownerId: week.ownerId, habitId })))
  }

  const onAdd = (date: string, category: string, task: NewTask): void => {
    startTransition(() => run(() => addTask({ ownerId: week.ownerId, date, category, ...task })))
  }

  /** La tâche ouverte dans sa pop-up (#160) — la carte n'en montre que le titre. */
  const [opened, setOpened] = useState<OpenTask | null>(null)
  const onOpen = (task: TodoTask, date: string, category: string): void => setOpened({ task, date, category })

  const onDayOff = (date: string): void => {
    startTransition(() => run(() => toggleDayOff({ ownerId: week.ownerId, date })))
  }

  /**
   * Une section créée depuis une colonne est RÉCURRENTE sur ce jour de la semaine : c'est le
   * comportement de leur écran, et c'est ce qu'on attend d'un rituel hebdomadaire (« 1:1 le
   * lundi »). Pour une section ponctuelle, il suffit de la retirer une fois remplie.
   */
  const onAddSection = (name: string, weekday: number): void => {
    startTransition(() => run(() => saveSection({ ownerId: week.ownerId, name, weekdays: [weekday] })))
  }

  const onDeleteSection = (name: string): void => {
    // `withTasks: false` — retirer une section ne doit jamais emporter des tâches. C'est ce que
    // leur écran promet explicitement.
    startTransition(() => run(() => deleteSection({ ownerId: week.ownerId, name, withTasks: false })))
  }

  /** Lâcher une tâche (#161) : optimiste, puis l'action — la semaine comme la pop-up d'un jour. */
  const onMove = (taskId: string, move: { date: string; category: string; beforeId: string | null }): void => {
    startTransition(async () => {
      applyOptimistic({ kind: 'move', taskId, ...move })
      await run(() => moveTask({ ownerId: week.ownerId, taskId, ...move }))
    })
  }

  /**
   * LA POP-UP D'UNE JOURNÉE (#162) — ouverte au clic sur l'en-tête d'une colonne, par-dessus la
   * semaine (décision de Benoit, 2026-10-12). Le jour vit dans l'URL (`?jour=`) : un rechargement
   * ou un lien partagé rouvre la même pop-up. Dans la semaine affichée, on change l'URL par
   * `history.replaceState`, que Next relie à `useSearchParams` sans rien redemander au serveur — la
   * donnée de la semaine est déjà là. Pour passer à la semaine voisine (flèche au lundi ou au
   * dimanche), une vraie navigation, qui charge l'autre semaine et rouvre la pop-up sur ce jour.
   */
  const searchParams = useSearchParams()
  const dayOpen = days.find((d) => d.date === searchParams.get('jour')) ?? null
  const withJour = (date: string | null): URLSearchParams => {
    const q = new URLSearchParams(searchParams.toString())
    if (date) q.set('jour', date)
    else q.delete('jour')
    return q
  }
  const openDay = (date: string): void => {
    if (days.some((d) => d.date === date)) {
      window.history.replaceState(null, '', `?${withJour(date).toString()}`)
      return
    }
    const q = withJour(date)
    q.set('week', addDays(date, -(isoWeekday(date) - 1)))
    router.push(`/chatter/presence/todo?${q.toString()}` as Route)
  }
  const closeDay = (): void => window.history.replaceState(null, '', `?${withJour(null).toString()}`)

  const column = {
    canWrite: week.canWrite,
    onToggle,
    onDelete,
    onAdd,
    onOpen,
    chatters: week.chatters,
    canOrganize: week.canOrganize,
    onDayOff,
    onAddSection,
    onDeleteSection,
  }

  /** La question « juste aujourd'hui » — dans la pop-up du jour quand elle est ouverte, sinon sous la grille. */
  const ask = recurring ? (
    <RecurringAsk
      task={recurring}
      canStop={habitOf(recurring)?.canEdit !== false}
      onOnce={onDeleteOnce}
      onStop={onDeleteHabit}
      onClose={() => setRecurring(null)}
    />
  ) : null

  return (
    <>
      <TodoDnd days={days} onMove={onMove}>
        <div className="weekwrap" aria-busy={busy}>
          <div className="week">
            {days.map((day) => (
              <DayColumn key={day.date} day={day} {...column} onOpenDay={openDay} />
            ))}
          </div>
        </div>
      </TodoDnd>
      {dayOpen ? null : ask}
      <DayDialog
        day={dayOpen}
        column={column}
        onMove={onMove}
        onPrev={() => dayOpen && openDay(addDays(dayOpen.date, -1))}
        onNext={() => dayOpen && openDay(addDays(dayOpen.date, 1))}
        onClose={closeDay}
      >
        {ask}
      </DayDialog>
      <TaskDialog open={opened} ownerId={week.ownerId} canOrganize={week.canOrganize} onClose={() => setOpened(null)} />
    </>
  )
}

/**
 * « Cette tâche revient chaque jour choisi » — la question à deux issues de leur écran
 * (todo.html:1459-1476).
 */
function RecurringAsk({
  task,
  canStop,
  onOnce,
  onStop,
  onClose,
}: {
  task: TodoTask
  /** L'arrêt de l'habitude est-il permis à l'appelant ? (`canEditHabit`, rendu par le serveur) */
  canStop: boolean
  onOnce: (task: TodoTask) => void
  onStop: (task: TodoTask) => void
  onClose: () => void
}) {
  return (
    <div className="recask" role="dialog" aria-label="Cette tâche revient chaque jour choisi">
      <p className="rt">Cette tâche revient chaque jour choisi</p>
      {/* La question n'a DEUX issues que si l'arrêt est permis. Sur une habitude déposée par
          l'encadrement, il ne reste que « juste aujourd'hui » : proposer « supprimer
          l'habitude » à quelqu'un à qui le serveur va répondre non, c'est promettre une porte
          qui n'ouvre pas. Le gabarit se retire depuis le panneau Habitudes, par son déposant. */}
      <p className="rd">
        {canStop
          ? 'La retirer seulement aujourd’hui, ou arrêter l’habitude pour de bon ?'
          : 'Elle t’a été déposée par ton encadrement : tu peux la sauter aujourd’hui, pas l’arrêter.'}
      </p>
      <div className="ra">
        <button type="button" className="btn sm" onClick={() => onOnce(task)}>
          Juste aujourd’hui
        </button>
        {canStop ? (
          <button type="button" className="btn sm danger" onClick={() => onStop(task)}>
            Supprimer l’habitude
          </button>
        ) : null}
        <button type="button" className="btn sm" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  )
}
