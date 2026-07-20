import { PlanningView } from './components/planning-view'
import type { PlanningData } from './types'

/**
 * Planning journalier — chacun lit LE SIEN (RLS) ; édition réservée aux rôles gérants
 * (admin/superadmin, et manager sur ses sous-managers directs). L'édition (canEdit) est
 * pilotée par la page ; le sélecteur de membre, lui, n'y transite plus (hissé au-dessus des
 * onglets, cf. `page.tsx`/`member-select.tsx`). Plages/pauses/répartition CALCULÉES des blocs.
 */
export function PlanningTemplate({
  data,
  canEdit,
}: {
  data: PlanningData
  /** Édition de la cible (on ne modifie pas SON propre planning, sauf superadmin). */
  canEdit: boolean
}) {
  return <PlanningView data={data} canEdit={canEdit} />
}
