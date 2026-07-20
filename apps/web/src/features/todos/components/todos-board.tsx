'use client'

import { useId, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { TodoCardPreview } from './todo-card'
import { TodoColumn } from './todo-column'
import { groupByStatus, statusLabel, STATUSES, type Todo, type TodoStatus } from '../types'

/**
 * Remplace le texte par défaut de dnd-kit (`defaultScreenReaderInstructions`, dist/core.esm.js
 * de `@dnd-kit/core`) : il décrit Espace/Flèches/Échap, un geste qui ne répond à rien puisque
 * le `KeyboardSensor` n'est pas monté (le menu « Déplacer vers » de chaque carte est le chemin
 * clavier officiel). dnd-kit ne relie ce texte à un élément que via `aria-describedby`, posé
 * par les `attributes` de `useDraggable` — volontairement pas spreadés sur la poignée
 * (`todo-card.tsx`), donc ce texte reste inerte en l'état ; gardé pour ne pas laisser le texte
 * anglais par défaut actif si `attributes` est un jour rebranché. Constante de module : ne
 * dépend d'aucune prop.
 */
const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Pour déplacer une tâche, faites-la glisser à la souris ou au doigt vers une colonne. ' +
    'Au clavier, utilisez le bouton « Déplacer vers » de la carte pour choisir directement la colonne de destination.',
}

/**
 * Kanban « façon Trello » — feuille de présentation pure : reçoit `todos` déjà OPTIMISTES et
 * les callbacks `onEdit`/`onDelete`/`onMove` depuis `TodosView`, qui porte l'état partagé entre
 * les deux vues (liste optimiste, dialog, filtre). Ce composant ne connaît que le drag & drop :
 * capteurs, `DndContext`, `DragOverlay`.
 */
export function TodosBoard({
  todos,
  onEdit,
  onDelete,
  onMove,
}: {
  todos: Todo[]
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => Promise<string | void>
  onMove: (todo: Todo, status: TodoStatus) => void
}) {
  // `useId` (et non un compteur de module) : stable entre le rendu serveur et l'hydratation,
  // et unique par requête concurrente sur le serveur. Sans ça, `DndContext` numérote ses
  // `aria-describedby` avec un compteur de module qui dérive dès la 2e requête servie par un
  // même process → erreur d'hydratation.
  const dndId = useId()
  const columns = useMemo(() => groupByStatus(todos), [todos])
  // Le drag ne démarre qu'après 6 px : sinon un simple clic sur la poignée serait avalé.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeTodo = activeId ? (todos.find((t) => t.id === activeId) ?? null) : null

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const status = event.over?.id
    if (typeof status !== 'string') return
    const todo = todos.find((t) => t.id === event.active.id)
    if (todo) onMove(todo, status as TodoStatus)
  }
  const onDragCancel = () => setActiveId(null)

  // Annonces diffusées à chaque étape du glisser : le défaut dnd-kit nomme l'élément par son
  // UUID brut et en anglais (« Picked up draggable item 3f2a-… ») — vérifié dans
  // `defaultAnnouncements` (dist/core.esm.js), diffusé même pour un glissement à la souris (la
  // région aria-live de `DndContext` ne dépend pas des `attributes` du draggable, contrairement
  // aux instructions ci-dessus). Ici, la TÂCHE est nommée par son titre et la COLONNE par son
  // libellé français (jamais un id). Dépend de `todos` (id → titre), donc mémoïsé dessus.
  const announcements = useMemo<Announcements>(() => {
    const todoTitle = (id: UniqueIdentifier) => todos.find((t) => t.id === id)?.title ?? 'la tâche'
    // L'id d'une colonne EST son statut (`useDroppable({ id: status })` dans todo-column.tsx) :
    // pas de résolution supplémentaire nécessaire, juste le libellé français.
    const columnLabel = (id: UniqueIdentifier | undefined) =>
      typeof id === 'string' ? statusLabel(id as TodoStatus) : null
    return {
      onDragStart: ({ active }) => `Tâche « ${todoTitle(active.id)} » saisie.`,
      onDragOver: ({ active, over }) => {
        const column = columnLabel(over?.id)
        return column
          ? `Tâche « ${todoTitle(active.id)} » déplacée au-dessus de la colonne ${column}.`
          : `Tâche « ${todoTitle(active.id)} » hors d'une colonne.`
      },
      onDragEnd: ({ active, over }) => {
        const column = columnLabel(over?.id)
        return column
          ? `Tâche « ${todoTitle(active.id)} » déposée dans la colonne ${column}.`
          : `Tâche « ${todoTitle(active.id)} » relâchée hors d'une colonne — déplacement annulé.`
      },
      onDragCancel: ({ active }) => `Glissement annulé. Tâche « ${todoTitle(active.id)} » inchangée.`,
    }
  }, [todos])

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS, announcements }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {STATUSES.map((s) => (
          <TodoColumn
            key={s.value}
            status={s.value}
            todos={columns[s.value]}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
      </div>
      {/* La carte SUIT le curseur via `DragOverlay` plutôt qu'en appliquant le `transform` de
          `useDraggable` sur la carte source : celle-ci resterait figée dans sa colonne
          d'origine, un `transform` seul ne suffit pas à donner l'impression qu'on la déplace
          réellement. Pas d'animation de dépôt personnalisée, pas de rotation (design maison). */}
      <DragOverlay>{activeTodo ? <TodoCardPreview todo={activeTodo} /> : null}</DragOverlay>
    </DndContext>
  )
}
