'use client'

import { useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
import { DropHintContext } from './drop-hint'
import { TaskPreview } from './task-item'
import { resolveDrop, type DropZone } from '../move-task'
import type { TodoDay } from '../types'

/**
 * Le GLISSER-DÉPOSER de la To-Do, sorti de `week-grid.tsx` pour servir deux surfaces : la semaine,
 * et la pop-up d'une journée (#162). Chacune a son propre contexte : la même journée est rendue
 * deux fois quand la pop-up est ouverte, et deux cibles de même id dans un seul contexte se
 * marcheraient dessus.
 */

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

export function TodoDnd({
  days,
  onMove,
  children,
}: {
  /** Les journées affichées (état optimiste) : `resolveDrop` y lit l'ordre courant. */
  days: TodoDay[]
  onMove: (taskId: string, move: { date: string; category: string; beforeId: string | null }) => void
  children: ReactNode
}) {
  const id = useId()
  const sensors = useSensors(
    // 6 px avant de considérer que c'est un glissement : sans ce seuil, un simple clic sur le
    // libellé démarre un drag et la sélection de texte devient impossible — et depuis le #160,
    // c'est ce clic qui ouvre la pop-up de la tâche.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  /** La tâche « attrapée » — celle que l'aperçu fait suivre au curseur. */
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeTask = activeId
    ? (days.flatMap((d) => d.sections.flatMap((s) => s.tasks)).find((t) => t.id === activeId) ?? null)
    : null

  /** Où la tâche portée se posera si on la lâche maintenant (#161) — le trait sur la carte visée. */
  const [hint, setHint] = useState<string | null>(null)

  const onDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id))

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
    if (move) onMove(taskId, move)
  }

  return (
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
      <DropHintContext value={hint}>{children}</DropHintContext>
      {/* La tâche SUIT le curseur, comme une carte Trello qu'on a attrapée ; l'originale reste en
          place, estompée. `dropAnimation={null}` : l'animation par défaut ramène l'aperçu vers la
          carte source, or la tâche est DÉJÀ posée à destination (état optimiste) — on la verrait
          repartir en arrière avant d'apparaître.

          Dans un PORTAIL (#162) : la pop-up d'une journée est centrée par un `transform`, qui
          ferait d'elle le repère d'un `position: fixed` — l'aperçu y décrocherait du curseur.
          `.trk` autour, pour garder l'apparence de la carte hors de la page du tracker. Rendu
          seulement pendant un glisser : `document` n'existe pas au rendu serveur. */}
      {activeTask
        ? createPortal(
            <div className="trk">
              <DragOverlay dropAnimation={null}>
                <TaskPreview task={activeTask} />
              </DragOverlay>
            </div>,
            document.body,
          )
        : null}
    </DndContext>
  )
}
