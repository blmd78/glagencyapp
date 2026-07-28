import { TodosMembers } from './components/todos-members'
import { TodosView } from './components/todos-view'
import type { Todo, TodoEntry } from './types'

/**
 * To-do personnelle — Server Component, aucun fetch (données en props). TOUS les noms
 * consultables sont posés sur la page, un par ligne, dépliables sur leur liste. Le sélecteur
 * `?membre=` reste au-dessus des onglets pour se restreindre à UNE personne : dans ce cas la
 * page ne passe qu'une entrée, avec sa liste DÉJÀ chargée (`todos`), affichée à plat sans
 * accordéon ni aller-retour. En pile, le contenu part à l'ouverture.
 *
 * Droits INCHANGÉS : chacun gère sa liste, la hiérarchie peut y déposer une tâche. La RLS
 * `can_write_todo_of` (0067) reste l'enforcement réel.
 */
export function TodosTemplate({
  entries,
  todos,
  profileId,
}: {
  entries: TodoEntry[]
  /** Liste de la personne affichée à plat — `null` en mode pile (chargée à l'ouverture). */
  todos: Todo[] | null
  /** Le SPECTATEUR — sert à distinguer « Ma to-do » de « To-do de X ». */
  profileId: string
}) {
  // Une seule personne (filtre `?membre=`, ou sous-manager qui n'a personne à consulter) :
  // pas d'accordéon à une seule ligne, sa liste directement.
  if (entries.length === 1 && todos) {
    const e = entries[0]
    return (
      <TodosView
        key={e.id}
        todos={todos}
        profileId={e.id}
        targetHasAccess={e.hasPlanningPage}
        label={e.id === profileId ? 'Ma to-do' : `To-do de ${e.name}`}
      />
    )
  }
  return <TodosMembers entries={entries} />
}
