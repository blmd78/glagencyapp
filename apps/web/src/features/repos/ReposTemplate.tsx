import { ReposView } from './components/repos-view'
import type { ReposData, ReposSelf } from './types'

/** Template Planning repos : sélecteur de semaine + grille éditable. Aucun fetch. */
export function ReposTemplate({
  data,
  isAdmin,
  canWrite,
  self,
}: {
  data: ReposData
  isAdmin: boolean
  canWrite: boolean
  self: ReposSelf
}) {
  return <ReposView data={data} isAdmin={isAdmin} canWrite={canWrite} self={self} />
}
