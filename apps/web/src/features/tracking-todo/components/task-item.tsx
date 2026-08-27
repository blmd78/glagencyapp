'use client'

import { useDraggable } from '@dnd-kit/core'
import type { TodoTask } from '../types'

/**
 * Une tâche — balisage repris de leur feuille : `.task > .box + .tb > .tt/.tm`, avec `.x` pour
 * supprimer et `.dragging` pendant le déplacement.
 *
 * Leur case à cocher est un bouton stylé (`.box`), pas un `<input>`. On garde leur rendu mais on
 * lui rend son sens : `role="checkbox"` + `aria-checked`, donc annoncé et actionnable au clavier —
 * ce que leur bouton nu ne faisait pas.
 *
 * Le glisser-déposer est posé sur le CORPS de la tâche (`.tb`), pas sur toute la carte : sans ça,
 * la case à cocher et la croix de suppression deviennent des poignées et ne répondent plus au clic.
 */
export function TaskItem({
  task,
  date,
  category,
  canWrite,
  onToggle,
  onDelete,
}: {
  task: TodoTask
  date: string
  category: string
  canWrite: boolean
  onToggle: (task: TodoTask, done: boolean) => void
  onDelete: (task: TodoTask) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { date, category },
    disabled: !canWrite,
  })

  const cls = ['task', task.done ? 'done' : '', isDragging ? 'dragging' : ''].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      <button
        type="button"
        className="box"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.label}
        disabled={!canWrite}
        onClick={() => onToggle(task, !task.done)}
      >
        ✓
      </button>
      <div className="tb" ref={setNodeRef} {...listeners} {...attributes}>
        <div className="tt">{task.label}</div>
        {task.virtual || task.fromOther ? (
          <div className="tm">
            {task.virtual ? <span className="rec">↻ récurrente</span> : null}
            {task.fromOther ? <span className="asg">déposée</span> : null}
          </div>
        ) : null}
      </div>
      {canWrite && !task.virtual ? (
        <button type="button" className="x" onClick={() => onDelete(task)} title="Supprimer">
          ✕
        </button>
      ) : null}
    </div>
  )
}
