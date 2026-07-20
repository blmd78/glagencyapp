'use client'

import { useDraggable } from '@dnd-kit/core'
import { GripVertical, MoveRight, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  priorityLabel,
  STATUSES,
  statusLabel,
  typeLabel,
  TYPE_CLASS,
  TYPE_ICON,
  type Todo,
  type TodoStatus,
} from '../types'

function TypeIcon({ todo }: { todo: Todo }) {
  if (!todo.type) return null
  const Icon = TYPE_ICON[todo.type]
  return (
    <Icon
      role="img"
      aria-label={typeLabel(todo.type)}
      className={cn('mt-0.5 size-4 shrink-0', TYPE_CLASS[todo.type])}
    />
  )
}

function CardMeta({ todo }: { todo: Todo }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {todo.priority !== 2 && <span>{priorityLabel(todo.priority)}</span>}
      {todo.release && <span>{todo.release}</span>}
      {todo.createdByName && <span>{todo.createdByName}</span>}
    </div>
  )
}

/**
 * Aperçu statique rendu dans le `<DragOverlay>` de `todos-board.tsx` pendant un glisser :
 * même apparence que la carte, sans les actions (inutiles le temps d'un geste) ni
 * `useDraggable` — ce n'est qu'une copie visuelle qui suit le curseur, la carte réelle sous
 * la colonne d'origine reste la source du drag.
 */
export function TodoCardPreview({ todo }: { todo: Todo }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card p-3 text-left">
      <div className="flex items-start gap-2">
        <TypeIcon todo={todo} />
        <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{todo.title}</span>
      </div>
      {todo.description && <p className="line-clamp-2 text-xs text-muted-foreground">{todo.description}</p>}
      <CardMeta todo={todo} />
    </div>
  )
}

export function TodoCard({
  todo,
  onEdit,
  onDelete,
  onMove,
}: {
  todo: Todo
  onEdit: () => void
  /** Renvoie un message d'erreur pour garder le dialog ouvert, rien en cas de succès. */
  onDelete: () => Promise<string | void>
  /** Repli clavier/tactile du drag & drop — obligatoire pour l'accessibilité (WCAG 2.5.7). */
  onMove: (status: TodoStatus) => void
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: todo.id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex flex-col gap-1.5 rounded-md border bg-card p-3 text-left',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Poignée DÉDIÉE : les listeners ne sont plus sur le titre entier (ils entraient en
            concurrence avec le clic). Visible au survol ET en permanence sur un appareil sans
            survol (`hover: none` : Tailwind v4 émet `group-hover:` sous `@media (hover: hover)`
            — sans ce complément, la poignée resterait invisible en permanence au doigt, alors
            que la vue liste par défaut doit rester utilisable sur mobile).
            Hors du parcours clavier ET de l'arbre d'accessibilité (`tabIndex={-1}` +
            `aria-hidden`) : le `KeyboardSensor` de dnd-kit n'est pas monté (le menu « Déplacer
            vers » est le seul chemin clavier officiel), donc un `<button>` focusable n'aurait
            rien à faire d'Entrée/Espace — juste une cible que lirait un lecteur d'écran sans
            action possible derrière. Les `listeners` de `useDraggable` restent spreadés : ils
            ne portent qu'un seul activateur, `onPointerDown` (vérifié dans
            `PointerSensor.activators`, dist/core.esm.js de `@dnd-kit/core`), qui ne dépend pas
            du focus — souris et tactile continuent donc de fonctionner. `attributes` (rôle
            « draggable », `aria-describedby`) reste volontairement non spreadé : il annoncerait
            des instructions Espace/Flèches qui ne répondent plus à rien depuis le retrait du
            `KeyboardSensor`. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="mt-0.5 shrink-0 touch-none cursor-grab text-muted-foreground opacity-0 outline-none transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100 active:cursor-grabbing"
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <TypeIcon todo={todo} />
        {/* flex-1 + break-words : un token long ininterrompu (URL collée) se coupe dans le
            cadre au lieu d'en déborder (même idiome que insight-card.tsx et
            planning-blocks-list.tsx). */}
        <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{todo.title}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Déplacer vers">
                <MoveRight className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATUSES.filter((s) => s.value !== todo.status).map((s) => (
                <DropdownMenuItem key={s.value} onSelect={() => onMove(s.value)}>
                  {statusLabel(s.value)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Modifier" onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
              variant="ghost"
              size="icon"
              className="size-7 text-red-600 hover:text-red-700"
              aria-label="Supprimer"
            >
                <Trash2 className="size-3.5" />
              </Button>
            }
            title="Supprimer cette tâche ?"
            onConfirm={onDelete}
          />
        </div>
      </div>
      {todo.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{todo.description}</p>
      )}
      <CardMeta todo={todo} />
    </div>
  )
}
