import { PoliceView } from './components/police-view'
import type { PoliceData } from './types'

/** Template Police : bascule Jour/Mois + sélecteur de période + saisie (jour uniquement) + journal.
 *  Plus de prop `isAdmin` : depuis 0106, la suppression suit `canWrite` comme le reste. */
export function PoliceTemplate({
  data,
  canWrite,
}: {
  data: PoliceData
  canWrite: boolean
}) {
  return <PoliceView data={data} canWrite={canWrite} />
}
