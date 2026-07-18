import { PlanningView } from './components/planning-view'
import type { PlanningData, PlanningMember } from './types'

/**
 * Planning journalier d'un sous-manager — lecture pour le membre (le RLS ne lui sert
 * que le sien), édition réservée à l'admin (sélecteur de membre + dialogs).
 * Les plages de section, pauses et la répartition du temps sont CALCULÉES des blocs.
 */
export function PlanningTemplate({
  data,
  hasSelect,
  canEdit,
  members,
}: {
  data: PlanningData | null
  /** Afficher le sélecteur de membre (il y a au moins une autre personne à ouvrir). */
  hasSelect: boolean
  /** Édition de la cible (on ne modifie pas SON propre planning, sauf superadmin). */
  canEdit: boolean
  members: PlanningMember[]
}) {
  return <PlanningView data={data} hasSelect={hasSelect} canEdit={canEdit} members={members} />
}
