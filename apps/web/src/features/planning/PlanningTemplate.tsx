import { PlanningView } from './components/planning-view'
import type { PlanningData, PlanningMember } from './types'

/**
 * Planning journalier d'un sous-manager — lecture pour le membre (le RLS ne lui sert
 * que le sien), édition réservée à l'admin (sélecteur de membre + dialogs).
 * Les plages de section, pauses et la répartition du temps sont CALCULÉES des blocs.
 */
export function PlanningTemplate({
  data,
  isAdmin,
  canEdit,
  members,
}: {
  data: PlanningData | null
  isAdmin: boolean
  /** Édition : le planning d'un ADMIN est réservé aux superadmins (consultation sinon). */
  canEdit: boolean
  members: PlanningMember[]
}) {
  return <PlanningView data={data} isAdmin={isAdmin} canEdit={canEdit} members={members} />
}
