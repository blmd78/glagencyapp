import { PlanningMembers } from './components/planning-members'
import { PlanningView } from './components/planning-view'
import type { PlanningData, PlanningEntry } from './types'

/**
 * Planning journalier — TOUS les noms consultables sont posés sur la page, un par ligne,
 * dépliables sur leur emploi du temps (maquette du propriétaire, 2026-07-26). Le sélecteur
 * `?membre=` reste disponible au-dessus des onglets pour se restreindre à UNE personne :
 * dans ce cas la page ne passe qu'une entrée, avec son planning DÉJÀ chargé (`data`), affiché
 * à plat sans accordéon ni aller-retour. En pile, le contenu part à l'ouverture.
 * Les droits d'édition sont calculés par la page, membre par membre (`entry.canEdit`) — la
 * RLS 0043/0061 + `requireCanEdit` restent le vrai verrou. Plages/pauses CALCULÉES des blocs.
 */
export function PlanningTemplate({
  entries,
  data,
}: {
  entries: PlanningEntry[]
  /** Planning de la personne affichée à plat — `null` en mode pile (chargé à l'ouverture). */
  data: PlanningData | null
}) {
  // Une seule personne (filtre `?membre=`, ou sous-manager qui n'a personne à consulter) :
  // pas d'accordéon à une seule ligne, son planning directement.
  if (entries.length === 1 && data)
    return <PlanningView data={data} canEdit={entries[0].canEdit} />
  return <PlanningMembers entries={entries} />
}
