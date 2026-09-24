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
 * Le corps n'est que la POIGNÉE (`setActivatorNodeRef`) : c'est la carte entière qui est mesurée
 * (`setNodeRef`), sans quoi l'aperçu qui suit le curseur prendrait la largeur du seul libellé.
 */
/** Libellé et badges — les mêmes sur la tâche et sur son aperçu pendant un glisser. */
function TaskBody({ task }: { task: TodoTask }) {
  return (
    <>
      <div className="tt">{task.label}</div>
      {task.virtual || task.fromOther || task.chatterId ? (
        <div className="tm">
          {task.virtual ? <span className="rec">↻ récurrente</span> : null}
          {task.fromOther ? <span className="asg">déposée</span> : null}
          {/* Une tâche 1:1 se signale : cocher n'y fera pas ce qu'on croit, ça ouvrira le bilan. */}
          {task.chatterId ? <span className="one">🎧 1:1 {task.chatterName ?? ''}</span> : null}
        </div>
      ) : null}
    </>
  )
}

/**
 * La carte « attrapée », rendue dans le `<DragOverlay>` de `week-grid.tsx` : elle suit le curseur
 * pendant que l'originale reste en place, estompée (`.dragging`). Copie visuelle sans actions ni
 * `useDraggable` — même précédent que `TodoCardPreview` du kanban.
 */
export function TaskPreview({ task }: { task: TodoTask }) {
  return (
    <div className={task.done ? 'task done lifted' : 'task lifted'}>
      <span className="box" aria-hidden>
        ✓
      </span>
      <div className="tb">
        <TaskBody task={task} />
      </div>
    </div>
  )
}

export function TaskItem({
  task,
  date,
  category,
  canWrite,
  canOrganize,
  onToggle,
  onDelete,
}: {
  task: TodoTask
  date: string
  category: string
  /** ATTESTER — cocher. Le titulaire seul. */
  canWrite: boolean
  /** ORGANISER — déplacer, supprimer. Le titulaire ou son encadrement. */
  canOrganize: boolean
  onToggle: (task: TodoTask, done: boolean) => void
  onDelete: (task: TodoTask) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { date, category },
    disabled: !canOrganize,
  })

  const cls = ['task', task.done ? 'done' : '', isDragging ? 'dragging' : ''].filter(Boolean).join(' ')

  return (
    <div ref={setNodeRef} className={cls}>
      <button
        type="button"
        className="box"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.chatterId && !task.done ? `${task.label} — rendre le bilan` : task.label}
        title={task.chatterId && !task.done ? 'Rendre le bilan sur la fiche du chatter' : undefined}
        disabled={!canWrite}
        onClick={() => onToggle(task, !task.done)}
      >
        ✓
      </button>
      <div className="tb" ref={setActivatorNodeRef} {...listeners} {...attributes}>
        <TaskBody task={task} />
      </div>
      {/* Un 1:1 qui a rendu son bilan ne se supprime plus : la session resterait orpheline dans la
          fiche du chatteur, et refaire le 1:1 en créerait une seconde. Le serveur le refuse
          (`deleteTask`) ; ne pas rendre la croix évite de proposer un geste qui échoue. */}
      {!task.hasBilan && canOrganize ? (
        // La croix s'affiche AUSSI sur une occurrence récurrente : `onDelete` la route vers la boîte
        // à deux issues (« juste aujourd'hui » / « supprimer l'habitude »). La masquer rendait ce
        // choix injoignable — le dialogue était du code mort.
        //
        // Sur la semaine d'un AUTRE, elle s'affiche sur TOUTE tâche depuis le 2026-09-07 : un
        // encadrant réorganise la semaine de son sous-manager, il n'est plus limité à ce qu'il y
        // avait lui-même déposé (`assertCanOrganize`).
        <button
          type="button"
          className="x"
          onClick={() => onDelete(task)}
          title={canWrite ? 'Supprimer' : 'Retirer cette tâche'}
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}
