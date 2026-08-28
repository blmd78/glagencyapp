'use client'

import { useId, useOptimistic, useState, useTransition } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { toast } from 'sonner'
import { DayColumn } from './day-column'
import { addTask, deleteSection, deleteTask, moveTask, saveSection, toggleTask } from '../actions'
import { toggleDayOff } from '../actions-content'
import type { TodoTask, TodoWeek } from '../types'

/**
 * dnd-kit annonce par défaut un mode d'emploi clavier (Espace / Flèches / Échap) qui ne répond à
 * rien tant que le `KeyboardSensor` n'est pas monté. Même correctif que le kanban `todos` : on
 * remplace le texte plutôt que de laisser une consigne anglaise qui ment.
 */
const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Pour déplacer une tâche, faites-la glisser à la souris ou au doigt vers un autre jour ou une ' +
    'autre section.',
}

/**
 * La semaine : sept colonnes, glisser-déposer entre jours et sections.
 *
 * Composant client assumé — contrairement au board, la donnée d'une semaine tient en quelques
 * dizaines de lignes, et tout ici est interactif (cocher, ajouter, déplacer). La sérialiser en
 * props coûte moins que d'inventer un aller-retour serveur par geste.
 *
 * `useOptimistic` : cocher une case doit répondre instantanément. La Server Action revalide
 * ensuite, et l'état optimiste est remplacé par la vérité serveur — en cas d'échec, la case
 * revient d'elle-même et un toast explique pourquoi.
 */
export function WeekGrid({ week }: { week: TodoWeek }) {
  const id = useId()
  const [, startTransition] = useTransition()
  const [days, applyOptimistic] = useOptimistic(
    week.days,
    (state, patch: { taskId: string; done: boolean }) =>
      state.map((d) => ({
        ...d,
        sections: d.sections.map((s) => ({
          ...s,
          tasks: s.tasks.map((t) => (t.id === patch.taskId ? { ...t, done: patch.done } : t)),
        })),
      })),
  )
  const [busy, setBusy] = useState(false)

  const sensors = useSensors(
    // 6 px avant de considérer que c'est un glissement : sans ce seuil, un simple clic sur le
    // libellé démarre un drag et la sélection de texte devient impossible.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

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
      router.push(`/chatter/presence/suivi/${task.chatterId}?bilan=${task.id}` as Route)
      return
    }
    startTransition(async () => {
      applyOptimistic({ taskId: task.id, done })
      await run(() => toggleTask({ ownerId: week.ownerId, taskId: task.id, done }))
    })
  }

  const onDelete = (task: TodoTask): void => {
    startTransition(() => run(() => deleteTask({ ownerId: week.ownerId, taskId: task.id })))
  }

  const onAdd = (date: string, category: string, label: string, chatterId?: string | null): void => {
    startTransition(() =>
      run(() => addTask({ ownerId: week.ownerId, date, category, label, chatterId: chatterId ?? null })),
    )
  }

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

  const onDragEnd = (e: DragEndEvent): void => {
    const target = e.over?.data.current as { date: string; category: string } | undefined
    const source = e.active.data.current as { date: string; category: string } | undefined
    if (!target || !source) return
    if (target.date === source.date && target.category === source.category) return
    startTransition(() =>
      run(() =>
        moveTask({
          ownerId: week.ownerId,
          taskId: String(e.active.id),
          date: target.date,
          category: target.category,
        }),
      ),
    )
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
    >
      <div className="weekwrap" aria-busy={busy}>
        <div className="week">
          {days.map((day) => (
            <DayColumn
              key={day.date}
              day={day}
              canWrite={week.canWrite}
              onToggle={onToggle}
              onDelete={onDelete}
              onAdd={onAdd}
              chatters={week.chatters}
              onDayOff={onDayOff}
              onAddSection={onAddSection}
              onDeleteSection={onDeleteSection}
            />
          ))}
        </div>
      </div>
    </DndContext>
  )
}
