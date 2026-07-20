'use client'

import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { TodoCard } from './todo-card'
import { statusLabel, type Todo, type TodoStatus } from '../types'

export function TodoColumn({
  status,
  todos,
  onEdit,
  onDelete,
  onMove,
}: {
  status: TodoStatus
  todos: Todo[]
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => Promise<string | void>
  onMove: (todo: Todo, status: TodoStatus) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-label={statusLabel(status)}
      className={cn('flex flex-col gap-3 rounded-md p-1 transition-colors', isOver && 'bg-muted/60')}
    >
      <h2 className="text-sm font-medium">
        {statusLabel(status)}{' '}
        <span className="text-muted-foreground">{todos.length}</span>
      </h2>
      <div className="flex flex-col gap-2">
        {todos.map((t) => (
          <TodoCard
            key={t.id}
            todo={t}
            onEdit={() => onEdit(t)}
            onDelete={() => onDelete(t)}
            onMove={(s) => onMove(t, s)}
          />
        ))}
        {todos.length === 0 && (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Rien ici.
          </p>
        )}
      </div>
    </section>
  )
}
