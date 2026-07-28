'use client'

import { CollapsibleSection } from '@/components/collapsible-section'
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
  onQuickAdd: (title: string) => Promise<ActionResult>
}) {
  // Pas de `useMemo` : le React Compiler (reactCompiler: true, next.config.ts) mémoïse déjà
  // ce calcul dérivé, une mémoïsation manuelle n'apporte plus rien.
  const columns = groupByStatus(todos)

  return (
    <div className="flex flex-col gap-4">
      {STATUSES.map((s) => (
        // « Terminé » repliée par défaut (la moins utile au quotidien) ; les deux autres
        // ouvertes — sections indépendantes, donc `defaultOpen` (non contrôlé).
        // Le markup repliable (cadre, chevron, `<h2 className="contents">` pour la navigation
        // par titres) vient de `CollapsibleSection`, partagé avec la pile de noms du Planning
        // et du Dashboard.
        <CollapsibleSection
          key={s.value}
          defaultOpen={s.value !== 'done'}
          trigger={
            <>
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
              <span className="font-normal text-muted-foreground">
                ({taskCountLabel(columns[s.value].length)})
              </span>
            </>
          }
        >
          {/* `divide-y` : un filet fin ENTRE chaque ligne (et avant « + Créer »), jamais
              autour — la bordure du panneau fait déjà le tour. */}
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
            {/* « + Créer » dans la SEULE section « À faire » (spec 2026-07-28-todos-dates,
                remplace le « point 5 » de la spec 2026-07-20) : une tâche naît toujours en
                « À faire », le chrono ne démarre qu'au passage en « En cours ». Les autres
                sections gardent un état vide explicite — le quick-add en tenait lieu. */}
            {s.value === 'todo' ? (
              <TodoQuickAdd onQuickAdd={onQuickAdd} />
            ) : (
              columns[s.value].length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">Rien ici</p>
              )
            )}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  )
}
