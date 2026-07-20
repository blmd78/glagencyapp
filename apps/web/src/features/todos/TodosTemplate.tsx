import { TodosView } from './components/todos-view'
import type { Todo } from './types'

/**
 * To-do personnelle — Server Component, aucun fetch (données en props). Toute l'interactivité
 * (état optimiste, dialog, bascule liste/kanban) vit dans `TodosView` (seul porteur de l'état
 * partagé entre les deux vues) : ce composant se contente de composer le libellé de la ligne
 * d'en-tête.
 *
 * `key={profileId}` sur `TodosView` : remonte tout son état (filtre par release, dialog
 * ouvert/en édition, saisie de l'ajout rapide) quand on change de personne via le sélecteur.
 * Sans ça, React réconcilie le même arbre client à travers un changement de personne — un
 * filtre resté positionné sur une release qui n'existe pas chez la nouvelle personne viderait
 * la liste sans qu'aucun contrôle visible ne permette de comprendre pourquoi ni de revenir en
 * arrière (le sélecteur de release ne se rend que s'il existe au moins une release).
 */
export function TodosTemplate({
  todos,
  profileId,
  targetName,
  isSelf,
  targetHasAccess,
}: {
  todos: Todo[]
  /** Porteur de la liste (cible du sélecteur) — jamais le spectateur. */
  profileId: string
  targetName: string
  isSelf: boolean
  /** La cible peut-elle ouvrir la page Planning ? Sinon elle ne verra jamais cette liste. */
  targetHasAccess: boolean
}) {
  return (
    <TodosView
      key={profileId}
      todos={todos}
      profileId={profileId}
      targetHasAccess={targetHasAccess}
      label={isSelf ? 'Ma to-do' : `To-do de ${targetName}`}
    />
  )
}
