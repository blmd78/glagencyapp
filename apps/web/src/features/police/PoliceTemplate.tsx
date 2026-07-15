import { PoliceView } from './components/police-view'
import type { PoliceData } from './types'

/** Template Police : sélecteur de jour + saisie (avertissement / malus) + journal du jour. */
export function PoliceTemplate({ data, isAdmin }: { data: PoliceData; isAdmin: boolean }) {
  return <PoliceView data={data} isAdmin={isAdmin} />
}
