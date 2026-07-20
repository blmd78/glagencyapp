import { Bookmark, Bug, ChevronDown, ChevronUp, Minus, Wrench, type LucideIcon } from 'lucide-react'

/** Une tâche de la to-do personnelle (spec 2026-07-20). */
export type TodoStatus = 'todo' | 'in_progress' | 'done'
export type TodoType = 'feature' | 'bug' | 'maintenance'
/** Rang numérique : 1 haute, 2 moyenne, 3 basse — trié tel quel (jamais par libellé). */
export type TodoPriority = 1 | 2 | 3
/** Préférence d'affichage de la to-do — persistée en cookie, défaut `liste`. */
export type TodoAffichage = 'liste' | 'kanban'

/**
 * Nom du cookie de préférence d'affichage. KANBAN EN PAUSE (2026-07-20) : plus rien ne
 * l'écrit ni ne le lit — conservé comme référence pour la réactivation (cf. todos-view.tsx).
 */
export const TODOS_AFFICHAGE_COOKIE = 'todos_affichage'

export interface Todo {
  id: string
  title: string
  description: string | null
  status: TodoStatus
  type: TodoType | null
  priority: TodoPriority
  release: string | null
  /** null = écrit par Claude en SQL direct (service role), ou auteur supprimé. */
  createdBy: string | null
  createdByName: string | null
  createdAt: string
  doneAt: string | null
}

/** Statuts, dans l'ordre d'affichage — sections de la liste, colonnes du kanban en pause. */
export const STATUSES: { value: TodoStatus; label: string }[] = [
  { value: 'todo', label: 'À faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'done', label: 'Terminé' },
]

/** Types facultatifs : sans type, la ligne/carte n'affiche aucun badge. */
export const TYPES: { value: TodoType; label: string }[] = [
  { value: 'feature', label: 'Fonctionnalité' },
  { value: 'bug', label: 'Bug' },
  { value: 'maintenance', label: 'Maintenance' },
]

export const PRIORITIES: { value: TodoPriority; label: string }[] = [
  { value: 1, label: 'Haute' },
  { value: 2, label: 'Moyenne' },
  { value: 3, label: 'Basse' },
]

export const statusLabel = (s: TodoStatus) => STATUSES.find((x) => x.value === s)?.label ?? s
export const typeLabel = (t: TodoType) => TYPES.find((x) => x.value === t)?.label ?? t
export const priorityLabel = (p: TodoPriority) => PRIORITIES.find((x) => x.value === p)?.label ?? ''

/**
 * Icône et couleur par type — source unique (`todo-card.tsx` ET `todo-row.tsx`). Le type se
 * lit d'abord à la FORME de l'icône, la couleur ne fait que renforcer — lisible en cas de
 * daltonisme.
 */
export const TYPE_ICON: Record<TodoType, LucideIcon> = {
  feature: Bookmark,
  bug: Bug,
  maintenance: Wrench,
}

export const TYPE_CLASS: Record<TodoType, string> = {
  feature: 'text-emerald-600 dark:text-emerald-400',
  bug: 'text-red-600 dark:text-red-400',
  maintenance: 'text-slate-500 dark:text-slate-400',
}

/**
 * Priorité en ICÔNE (chevron haut/bas), pas en toutes lettres : axe ordonné, une flèche se
 * scanne plus vite qu'un mot. `PRIORITIES` fournit le libellé, repris en `aria-label` —
 * l'icône n'est jamais seule pour un lecteur d'écran.
 */
export const PRIORITY_ICON: Record<TodoPriority, LucideIcon> = {
  1: ChevronUp,
  2: Minus,
  3: ChevronDown,
}

export const PRIORITY_CLASS: Record<TodoPriority, string> = {
  1: 'text-red-600 dark:text-red-400',
  2: 'text-amber-600 dark:text-amber-400',
  3: 'text-emerald-600 dark:text-emerald-400',
}

/** Badge de statut : teinte de fond par état. Le LIBELLÉ reste toujours écrit dans le badge —
 *  la couleur n'est jamais le seul vecteur d'information. */
export const STATUS_CLASS: Record<TodoStatus, string> = {
  todo: 'bg-slate-500/10 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300',
  in_progress: 'bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300',
  done: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
}

/**
 * Répartit les tâches par colonne. Le service les rend déjà triées (priorité puis date) ; seule
 * la colonne « Terminé » est re-triée par done_at décroissant, ce qui ne justifie pas un second
 * aller-retour SQL. Vit ici (pas dans une vue) : liste ET kanban en dépendent — tri unique.
 */
export function groupByStatus(todos: Todo[]): Record<TodoStatus, Todo[]> {
  const out: Record<TodoStatus, Todo[]> = { todo: [], in_progress: [], done: [] }
  for (const t of todos) out[t.status].push(t)
  // Compare des INSTANTS, pas des chaînes : deux formats ISO coexistent (PostgREST renvoie
  // `+00:00`, l'état optimiste pose `…Z`) — une comparaison lexicale n'est fausse dès qu'un
  // décalage (`+02:00`) apparaît. `doneAt` absent (cas normalement impossible pour une tâche
  // `done`) part en fin de liste (epoch 0).
  const doneAtMs = (t: Todo) => (t.doneAt ? new Date(t.doneAt).getTime() : 0)
  out.done.sort((a, b) => doneAtMs(b) - doneAtMs(a))
  return out
}
