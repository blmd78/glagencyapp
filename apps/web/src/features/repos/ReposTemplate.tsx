import { ReposView } from './components/repos-view'
import type { ReposData } from './types'

/** Template Planning repos : sélecteur de semaine + grille éditable. Aucun fetch. */
export function ReposTemplate({ data, isAdmin }: { data: ReposData; isAdmin: boolean }) {
  return <ReposView data={data} isAdmin={isAdmin} />
}
