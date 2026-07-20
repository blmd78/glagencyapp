'use client'

import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ActionResult } from '@/lib/actions'
import { TodoQuickAdd } from './todo-quick-add'
import { TodoRow } from './todo-row'
import { cn } from '@/lib/utils'
import { groupByStatus, STATUS_CLASS, STATUSES, type Todo, type TodoStatus } from '../types'

/** Accord du compteur de section — jamais « 1 tâches » ni « 0 tâche » (mockup Backlog Jira :
 *  « (2 tâches) », « (1 tâche) », « (aucune tâche) »). */
const taskCountLabel = (n: number) => (n === 0 ? 'aucune tâche' : n === 1 ? '1 tâche' : `${n} tâches`)

/**
 * Vue liste : trois panneaux encadrés (À faire / En cours / Terminé), maquette « Backlog » Jira
 * fournie par le propriétaire — bordure fonctionnelle qui délimite chaque section et sépare
 * les lignes, pas un ornement. Les TROIS sections sont repliables (avant : seule « Terminé » —
 * cf. spec point 1) ; même `groupByStatus` que le kanban (source de tri unique). Pas de
 * `DataTable` : il imposerait des largeurs de colonnes qui étranglent le titre et embarque
 * ~15 ko de client pour une feature secondaire.
 */
export function TodosList({
  todos,
  onEdit,
  onDelete,
  onMove,
  onQuickAdd,
}: {
  todos: Todo[]
  onEdit: (todo: Todo) => void
  /** Renvoie un message d'erreur pour garder le dialog ouvert, rien en cas de succès. */
  onDelete: (todo: Todo) => Promise<string | void>
  onMove: (todo: Todo, status: TodoStatus) => void
  onQuickAdd: (title: string, status: TodoStatus) => Promise<ActionResult>
}) {
  // Pas de `useMemo` : le React Compiler (reactCompiler: true, next.config.ts) mémoïse déjà
  // ce calcul dérivé, une mémoïsation manuelle n'apporte plus rien.
  const columns = groupByStatus(todos)

  return (
    <div className="flex flex-col gap-4">
      {STATUSES.map((s) => (
        // « Terminé » repliée par défaut (la moins utile au quotidien) ; les deux autres ouvertes.
        <Collapsible key={s.value} defaultOpen={s.value !== 'done'} className="rounded-md border bg-card">
          {/* `<h2>` de même niveau pour les 3 sections : sans lui, la navigation par titres
              (lecteur d'écran) saute ces sections. `display: contents` (`className="contents"`) :
              le titre existe dans l'arbre d'accessibilité SANS ajouter de boîte propre — la mise
              en page du trigger (chevron + libellé + compteur) reste identique, aucun style
              visuel touché. */}
          <h2 className="contents">
            <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/50">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              {/* Même badge teinté que sur les lignes (STATUS_CLASS, source unique) : replier une
                  section ne doit pas faire perdre le repère couleur de l'état qu'elle contient. */}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase',
                  STATUS_CLASS[s.value],
                )}
              >
                {s.label}
              </span>
              <span className="font-normal text-muted-foreground">({taskCountLabel(columns[s.value].length)})</span>
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent className="border-t">
            {/* `divide-y` : un filet fin ENTRE chaque ligne (et avant « + Créer »), jamais
                autour — la bordure du panneau (ci-dessus) fait déjà le tour. */}
            <div className="flex flex-col divide-y divide-border">
              {columns[s.value].map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  onEdit={() => onEdit(t)}
                  onDelete={() => onDelete(t)}
                  onMove={(status) => onMove(t, status)}
                />
              ))}
              {/* « + Créer » dans CHAQUE section (pas seulement « À faire », point 5 de la
                  spec) : une tâche créée depuis « En cours » doit naître EN COURS — un bouton
                  qui la déposerait dans « À faire » mentirait sur son statut. Fait aussi office
                  d'état vide : plus de « Rien ici », cette ligne est toujours là. */}
              <TodoQuickAdd status={s.value} onQuickAdd={onQuickAdd} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  )
}
