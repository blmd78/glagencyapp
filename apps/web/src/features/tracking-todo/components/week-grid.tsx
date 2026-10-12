'use client'

import { useId, useOptimistic, useState, useTransition } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Active,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Over,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'
import { toast } from 'sonner'
import { DayColumn, type NewTask } from './day-column'
import { TaskDialog, type OpenTask } from './task-dialog'
import { DropHintContext } from './drop-hint'
import { TaskPreview } from './task-item'
import { moveTaskInDays, resolveDrop, type DropZone } from '../move-task'
import { addTask, deleteHabit, deleteSection, deleteTask, deleteTaskOccurrence, moveTask, saveSection, toggleTask } from '../actions'
import { toggleDayOff } from '../actions-content'
import type { TodoTask, TodoWeek } from '../types'

/**
 * dnd-kit annonce par défaut un mode d'emploi clavier (Espace / Flèches / Échap) qui ne répond à
 * rien tant que le `KeyboardSensor` n'est pas monté. Même correctif que le kanban `todos` : on
 * remplace le texte plutôt que de laisser une consigne anglaise qui ment.
 */
const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Pour déplacer une tâche, faites-la glisser à la souris ou au doigt vers un autre jour, une ' +
    'autre section, ou au-dessus d’une autre tâche pour changer son rang.',
}

/**
 * La cible est sous le POINTEUR, et la plus précise l'emporte : une TÂCHE (#161, pour changer de
 * rang), sinon une section, sinon la journée qui la contient — leur `zoneOf` (todo.html:1592) :
 * `.tgroup` d'abord, `.dayb` sinon. Les zones sont imbriquées : le calcul par défaut (recouvrement de
 * rectangles) les départagerait au hasard des tailles. La carte qu'on porte n'est jamais sa propre
 * cible : elle reste en place, estompée, sous le pointeur au départ du geste.
 */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const data = (c: (typeof hits)[number]) =>
    c.data?.droppableContainer.data.current as { category?: string; taskId?: string } | undefined
  const task = hits.find((c) => data(c)?.taskId !== undefined && c.id !== `task:${String(args.active.id)}`)
  if (task) return [task]
  const section = hits.find((c) => data(c)?.taskId === undefined && data(c)?.category !== undefined)
  return section ? [section] : hits.filter((c) => data(c)?.taskId === undefined)
}

/** La zone survolée : une tâche (moitié haute = au-dessus, basse = en dessous), une section, un jour. */
function zoneOf(active: Active, over: Over | null): DropZone | null {
  const data = over?.data.current as { date: string; category?: string; taskId?: string } | undefined
  if (!over || !data) return null
  if (data.taskId !== undefined) {
    const r = active.rect.current.translated
    const after = !!r && r.top + r.height / 2 > over.rect.top + over.rect.height / 2
    return { kind: 'task', date: data.date, category: data.category ?? '', taskId: data.taskId, after }
  }
  if (data.category !== undefined) return { kind: 'section', date: data.date, category: data.category }
  return { kind: 'day', date: data.date }
}

/**
 * La semaine : sept colonnes, glisser-déposer entre jours et sections.
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
  const id = useId()
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

  /** La tâche « attrapée » — celle que l'aperçu fait suivre au curseur. */
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeTask = activeId
    ? (days.flatMap((d) => d.sections.flatMap((s) => s.tasks)).find((t) => t.id === activeId) ?? null)
    : null

  const onDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id))

  /** Où la tâche portée se posera si on la lâche maintenant (#161) — le trait sur la carte visée. */
  const [hint, setHint] = useState<string | null>(null)
  const onDragMove = (e: DragMoveEvent): void => {
    const zone = zoneOf(e.active, e.over)
    setHint(zone?.kind === 'task' ? `${zone.taskId}:${zone.after ? 'after' : 'before'}` : null)
  }

  const onDragEnd = (e: DragEndEvent): void => {
    setActiveId(null)
    setHint(null)
    const zone = zoneOf(e.active, e.over)
    const source = e.active.data.current as { date: string; category: string } | undefined
    if (!zone || !source) return
    const taskId = String(e.active.id)
    // Rien ne change (lâchée à sa place) : pas d'aller-retour serveur.
    const move = resolveDrop(days, taskId, source, zone)
    if (!move) return
    startTransition(async () => {
      applyOptimistic({ kind: 'move', taskId, ...move })
      await run(() => moveTask({ ownerId: week.ownerId, taskId, ...move }))
    })
  }

  return (
    <>
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setHint(null)
      }}
      accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
    >
      <DropHintContext value={hint}>
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
                onOpen={onOpen}
                chatters={week.chatters}
                canOrganize={week.canOrganize}
                onDayOff={onDayOff}
                onAddSection={onAddSection}
                onDeleteSection={onDeleteSection}
              />
            ))}
          </div>
        </div>
      </DropHintContext>
      {/* La tâche SUIT le curseur, comme une carte Trello qu'on a attrapée ; l'originale reste en
          place, estompée. `dropAnimation={null}` : l'animation par défaut ramène l'aperçu vers la
          carte source, or la tâche est DÉJÀ posée sur son nouveau jour (état optimiste) — on la
          verrait repartir en arrière avant d'apparaître à destination. */}
      <DragOverlay dropAnimation={null}>{activeTask ? <TaskPreview task={activeTask} /> : null}</DragOverlay>
    </DndContext>
      {recurring ? (
        <div className="recask" role="dialog" aria-label="Cette tâche revient chaque jour choisi">
          <p className="rt">Cette tâche revient chaque jour choisi</p>
          {/* La question n'a DEUX issues que si l'arrêt est permis. Sur une habitude déposée par
              l'encadrement, il ne reste que « juste aujourd'hui » : proposer « supprimer
              l'habitude » à quelqu'un à qui le serveur va répondre non, c'est promettre une porte
              qui n'ouvre pas. Le gabarit se retire depuis le panneau Habitudes, par son déposant. */}
          <p className="rd">
            {habitOf(recurring)?.canEdit === false
              ? 'Elle t’a été déposée par ton encadrement : tu peux la sauter aujourd’hui, pas l’arrêter.'
              : 'La retirer seulement aujourd’hui, ou arrêter l’habitude pour de bon ?'}
          </p>
          <div className="ra">
            <button type="button" className="btn sm" onClick={() => onDeleteOnce(recurring)}>
              Juste aujourd’hui
            </button>
            {habitOf(recurring)?.canEdit === false ? null : (
              <button type="button" className="btn sm danger" onClick={() => onDeleteHabit(recurring)}>
                Supprimer l’habitude
              </button>
            )}
            <button type="button" className="btn sm" onClick={() => setRecurring(null)}>
              Fermer
            </button>
          </div>
        </div>
      ) : null}
      <TaskDialog open={opened} ownerId={week.ownerId} canOrganize={week.canOrganize} onClose={() => setOpened(null)} />
    </>
  )
}
