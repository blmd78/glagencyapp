'use client'

import { ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { TodoPeek } from './todo-peek'
import {
  priorityLabel,
  PRIORITY_CLASS,
  PRIORITY_ICON,
  STATUS_CLASS,
  STATUSES,
  statusLabel,
  typeLabel,
  TYPE_CLASS,
  TYPE_ICON,
  type Todo,
  type TodoStatus,
} from '../types'

/**
 * Ligne de la vue liste (panneau « Backlog » Jira) : icône de type + titre + aperçu de la
 * description (tronqué, spec 2026-07-23) à gauche ; méta discrète, pastille de statut, auteur,
 * actions (œil TodoPeek / crayon / poubelle) à droite, dans cet ordre. La pastille de
 * statut remplace l'icône de statut à gauche (ancienne maquette) : un `Button`, pas un
 * `Badge` — c'est un DÉCLENCHEUR de menu (le même `DropdownMenuRadioGroup`/`onMove` qu'avant),
 * pas une étiquette passive ; `Badge` rend un `<span>` sans gestion clavier/focus native, il
 * aurait fallu la lui greffer à la main pour retrouver ce que `Button` offre déjà. Les 3
 * statuts se distinguent par leur LIBELLÉ écrit dans la pastille (capitales via CSS
 * `uppercase`, pas une couleur par statut) : la seule couleur forte d'une ligne reste celle du
 * type, à gauche.
 */
export function TodoRow({
  todo,
  onEdit,
  onDelete,
  onMove,
}: {
  todo: Todo
  onEdit: () => void
  /** Renvoie un message d'erreur pour garder le dialog ouvert, rien en cas de succès. */
  onDelete: () => Promise<string | void>
  onMove: (status: TodoStatus) => void
}) {
  const Icon = todo.type ? TYPE_ICON[todo.type] : null
  const PriorityIcon = PRIORITY_ICON[todo.priority]
  return (
    <div className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
      {/* COLONNE titre à largeur FIXE (w-72, plafonnée à 50 % sur écran étroit) quand une
          description suit : tous les titres « s'arrêtent au même endroit », les aperçus de
          description démarrent donc alignés d'une ligne à l'autre. L'icône de type vit DANS la
          colonne : elle est conditionnelle, la laisser dehors décalerait l'alignement des
          lignes sans type. Sans description, pas de colonne — le titre reprend toute la
          largeur comme avant. */}
      <div
        className={cn(
          'flex min-w-0 items-center gap-2',
          todo.description ? 'w-72 max-w-[50%] shrink-0' : 'flex-1',
        )}
      >
        {Icon && todo.type && (
          <Icon role="img" aria-label={typeLabel(todo.type)} className={cn('size-4 shrink-0', TYPE_CLASS[todo.type])} />
        )}
        <span className="truncate text-sm font-medium">{todo.title}</span>
      </div>
      {/* Aperçu de la description, tronqué (`truncate` = nowrap : les sauts de ligne saisis
          s'aplatissent en espaces — la mise en forme complète se lit dans l'œil, TodoPeek). */}
      {todo.description && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{todo.description}</span>
      )}
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
        {/* Priorité en icône, TOUJOURS affichée (y compris « moyenne ») : une échelle qui
            disparaît à mi-course ne se scanne plus — l'œil ne sait pas si l'absence veut dire
            « moyenne » ou « non renseignée ». `aria-label` = le libellé, jamais l'icône seule. */}
        <PriorityIcon
          role="img"
          aria-label={`Priorité ${priorityLabel(todo.priority).toLowerCase()}`}
          className={cn('size-4 shrink-0', PRIORITY_CLASS[todo.priority])}
        />
        {/* RELEASE EN PAUSE : {todo.release && <span>{todo.release}</span>} */}
        {/* Ouvre les 3 statuts en DropdownMenuRadioGroup, appelle le MÊME onMove que le kanban
            (valeur ABSOLUE, jamais un déplacement relatif). */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 gap-1 rounded-full px-2 text-[11px] font-medium tracking-wide uppercase',
                STATUS_CLASS[todo.status],
              )}
              aria-label={`Statut : ${statusLabel(todo.status)} — changer`}
            >
              {statusLabel(todo.status)}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={todo.status} onValueChange={(v) => onMove(v as TodoStatus)}>
              {STATUSES.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {todo.createdByName && <span>{todo.createdByName}</span>}
      </div>
      {/* Toujours visibles : qui voit une to-do peut l'écrire (`todos_select` et les policies
          d'écriture partagent le prédicat `can_write_todo_of`, migration 0067) — il n'existe
          donc aucun spectateur en lecture seule à qui masquer ces actions. Les révéler au
          survol les rendait introuvables au doigt et invisibles au premier coup d'œil. */}
      <div className="ml-1 flex shrink-0 items-center justify-end gap-1">
        {/* Consultation rapide (popover lecture seule) — AVANT le crayon : lire avant d'éditer. */}
        <TodoPeek todo={todo} />
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
  )
}
