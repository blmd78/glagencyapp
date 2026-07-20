import { createClient } from '@/lib/supabase/server'
import type { Todo, TodoPriority, TodoStatus, TodoType } from '../types'

/**
 * To-do d'UNE personne (la cible du sélecteur). Le cloisonnement est porté par la RLS
 * (`todos_select` → `can_write_todo_of`, 0067) : la lecture n'aboutit que si l'on a le droit
 * d'écrire chez cette personne (lecture = écriture, spec §1). Volume : quelques dizaines de
 * lignes → pas de RPC/fetchAll (largement sous 1000).
 *
 * Tri : priorité (rang NUMÉRIQUE 1→3), puis date de création. La colonne « Terminé » est
 * re-triée par `done_at` décroissant côté composant (un seul aller-retour SQL).
 */
export async function getTodos(targetId: string): Promise<Todo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('todos')
    .select('id, title, description, status, type, priority, release, created_by, created_by_name, created_at, done_at')
    .eq('profile_id', targetId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as TodoStatus,
    type: (t.type ?? null) as TodoType | null,
    priority: t.priority as TodoPriority,
    release: t.release,
    createdBy: t.created_by,
    // Nom DÉNORMALISÉ (0067) : surtout pas une jointure sur `profiles`, dont la RLS (0054)
    // renverrait null à un manager pour un auteur admin. Sans auteur = écrit par Claude.
    createdByName: t.created_by_name ?? (t.created_by ? null : 'Claude'),
    createdAt: t.created_at,
    doneAt: t.done_at,
  }))
}
