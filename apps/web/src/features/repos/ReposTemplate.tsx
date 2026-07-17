import { ReposView } from './components/repos-view'
import type { ReposData } from './types'

/** Template Planning repos : sélecteur de semaine + grille éditable. Aucun fetch. */
export function ReposTemplate({
  data,
  isAdmin,
  canWrite,
}: {
  data: ReposData
  isAdmin: boolean
  canWrite: boolean
}) {
  return <ReposView data={data} isAdmin={isAdmin} canWrite={canWrite} />
}
