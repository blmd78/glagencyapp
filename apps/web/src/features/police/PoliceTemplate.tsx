import { PoliceView } from './components/police-view'
import type { SanctionPrefill } from './components/sanction-dialog'
import type { PoliceData } from './types'

/** Template Police : KPIs + saisie + journal — période pilotée par le datepicker global du header.
 *  Plus de prop `isAdmin` : depuis 0106, la suppression suit `canWrite` comme le reste. */
export function PoliceTemplate({
  data,
  canWrite,
  prefill,
}: {
  data: PoliceData
  canWrite: boolean
  /** Sanction amorcée depuis le Relevé d'équipe — valeurs proposées, rien d'enregistré. */
  prefill?: SanctionPrefill
}) {
  return <PoliceView data={data} canWrite={canWrite} prefill={prefill} />
}
