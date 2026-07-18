import { PlanningView } from './components/planning-view'
import type { PlanningData, PlanningMember } from './types'

/**
 * Planning journalier — chacun lit LE SIEN (RLS) ; édition réservée aux rôles gérants
 * (admin/superadmin, et manager sur ses sous-managers directs). Le sélecteur (members) et
 * l'édition (canEdit) sont pilotés par la page. Plages/pauses/répartition CALCULÉES des blocs.
 */
export function PlanningTemplate({
  data,
  canEdit,
  members,
}: {
  data: PlanningData
  /** Édition de la cible (on ne modifie pas SON propre planning, sauf superadmin). */
  canEdit: boolean
  members: PlanningMember[]
}) {
  return <PlanningView data={data} canEdit={canEdit} members={members} />
}
