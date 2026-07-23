'use client'

import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  priorityLabel,
  PRIORITY_CLASS,
  PRIORITY_ICON,
  STATUS_CLASS,
  statusLabel,
  typeLabel,
  TYPE_CLASS,
  TYPE_ICON,
  type Todo,
} from '../types'

/**
 * Consultation rapide d'une tâche (spec 2026-07-23) : popover LECTURE SEULE ancré à l'œil —
 * titre, statut/priorité, description complète, auteur. Un Popover, pas un Dialog : consulter
 * ne doit coûter qu'un clic et se refermer d'un clic ailleurs, sans assombrir la page. Aucune
 * action dedans — modifier reste sur le crayon de la ligne. L'œil est présent sur TOUTES les
 * lignes (choix spec) : position constante des actions, même quand la description est vide.
 */
export function TodoPeek({ todo }: { todo: Todo }) {
  const Icon = todo.type ? TYPE_ICON[todo.type] : null
  const PriorityIcon = PRIORITY_ICON[todo.priority]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Voir le détail">
          <Eye className="size-3.5" />
        </Button>
      </PopoverTrigger>
      {/* `align="end"` : l'œil vit en bout de ligne, un popover centré déborderait à droite. */}
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            {/* Mêmes icône/couleur de type que la ligne (TYPE_ICON/TYPE_CLASS, source unique). */}
            {Icon && todo.type && (
              <Icon
                role="img"
                aria-label={typeLabel(todo.type)}
                className={cn('mt-0.5 size-4 shrink-0', TYPE_CLASS[todo.type])}
              />
            )}
            <span className="text-sm font-medium">{todo.title}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Pastille de statut : mêmes teintes que la ligne/les sections (STATUS_CLASS) —
                mais un simple <span> passif ici, PAS le déclencheur de menu de todo-row. */}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase',
                STATUS_CLASS[todo.status],
              )}
            >
              {statusLabel(todo.status)}
            </span>
            {/* Priorité : icône + libellé ÉCRIT (la place ne manque pas ici, contrairement à la
                ligne) — l'icône devient décorative, aria-hidden. */}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <PriorityIcon aria-hidden className={cn('size-4', PRIORITY_CLASS[todo.priority])} />
              {priorityLabel(todo.priority)}
            </span>
          </div>
          {todo.description ? (
            // `whitespace-pre-wrap` : les sauts de ligne saisis sont conservés — raison d'être
            // du « pas de trim » de emptyToNull (todo-dialog). Scroll au-delà de max-h-60.
            <p className="max-h-60 overflow-y-auto text-sm whitespace-pre-wrap">{todo.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune description</p>
          )}
          <p className="text-xs text-muted-foreground">
            {/* createdByName null = écrit par Claude en SQL direct (cf. types.ts). */}
            {todo.createdByName ?? 'Claude'} · {new Date(todo.createdAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
