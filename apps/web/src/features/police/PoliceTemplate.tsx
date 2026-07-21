import { PoliceView } from './components/police-view'
import type { PoliceData } from './types'

/** Template Police : bascule Jour/Mois + sélecteur de période + saisie (jour uniquement) + journal. */
export function PoliceTemplate({
  data,
  isAdmin,
  canWrite,
}: {
  data: PoliceData
  isAdmin: boolean
  canWrite: boolean
}) {
  return <PoliceView data={data} isAdmin={isAdmin} canWrite={canWrite} />
}
